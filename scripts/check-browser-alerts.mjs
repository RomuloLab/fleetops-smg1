import assert from 'node:assert/strict';
import { BrowserAlerts, browserAlertPlatform, readAlertCursor, saveAlertCursor } from '../lib/browser-alerts.ts';
import { carrierNoticeContent, schedulingNotice } from '../lib/scheduling-alert-content.ts';
function fixture({stored=false, permission='granted', brokenAudio=false, suspended=false}={}) {
  const storage={enabled:stored}; const contexts=[]; const notifications=[]; let userGesture=!suspended;
  const platform={
    readEnabled:()=>storage.enabled, writeEnabled:enabled=>{storage.enabled=enabled;},
    permission:()=>permission, requestPermission:async()=>permission,
    createAudio(){
      if(brokenAudio)throw new Error('Audio unavailable');
      const context={state:suspended?'suspended':'running',currentTime:0,destination:{},onstatechange:null,resumeCalls:0,plays:0,
        async resume(){this.resumeCalls++;if(userGesture){this.state='running';this.onstatechange?.();}},
        async suspend(){this.state='suspended';this.onstatechange?.();}, async close(){this.state='closed';},
        createOscillator(){return {frequency:{value:0},connect(){},start(){context.plays++;},stop(){},disconnect(){}};},
        createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
      };
      contexts.push(context);return context;
    },
    notify(title,options){const notice={title,options,onclick:null,closed:false,close(){this.closed=true;}};notifications.push(notice);return notice;}
  };
  return {platform,storage,contexts,notifications,gesture:()=>{userGesture=true;}};
}
const f=fixture(); const first=new BrowserAlerts(f.platform,()=>{}); first.start();
assert.equal(first.settings.enabled,false);
await first.enable(); first.play(); assert.equal(f.storage.enabled,true); assert.equal(first.settings.sound,'ready');
assert.equal(f.contexts[0].plays,2);
let opened=false;assert.equal(first.show('Novo pedido de Scheduling',{body:'ALC · Vuc SDD'},()=>{opened=true;}),true);
f.notifications[0].onclick();assert.equal(opened,true);
first.dispose();
const statusEvent={seq:1,id:'12345678-1234-1234-1234-123456789abc',carrier:'alc',date:'2026-10-26',cycle:'AM',quantity:2,modalName:'Vuc SDD',status:'not_done',resolutionNotes:'Sem veículo disponível no horário solicitado.'};
const declinedNotice=schedulingNotice([statusEvent],true);assert.ok(declinedNotice);assert.equal(declinedNotice.count,1);
const declinedContent=carrierNoticeContent(declinedNotice);assert.equal(declinedContent.systemTitle,'Pedido não foi feito');assert.equal(declinedContent.outcome,'PEDIDO NÃO FOI FEITO.');assert.equal(declinedContent.reason,statusEvent.resolutionNotes);
const statusFixture=fixture();const statusAlerts=new BrowserAlerts(statusFixture.platform,()=>{});statusAlerts.start();await statusAlerts.enable();
statusAlerts.play();assert.equal(statusFixture.contexts[0].plays,2);
assert.equal(statusAlerts.show(declinedContent.systemTitle,{body:declinedContent.outcome+'\nMotivo: '+declinedContent.reason},()=>{}),true);
assert.match(statusFixture.notifications[0].options.body,/PEDIDO NÃO FOI FEITO\.[\s\S]*Motivo: Sem veículo/);statusAlerts.dispose();
const corrected=schedulingNotice([statusEvent,{...statusEvent,seq:2,status:'done',resolutionNotes:''}],true);assert.equal(corrected.count,1);assert.equal(corrected.request.status,'done');assert.equal(carrierNoticeContent(corrected).reason,'');
const correctedBack=schedulingNotice([{...statusEvent,status:'done'},statusEvent],true);assert.equal(correctedBack.request.status,'not_done');
const mixed=schedulingNotice([statusEvent,{...statusEvent,id:'other',seq:2,status:'done',resolutionNotes:''},{...statusEvent,seq:3}],true);
assert.equal(mixed.count,2);assert.equal(mixed.request.seq,3);assert.equal(mixed.notDoneCount,1);assert.match(carrierNoticeContent(mixed).summary,/1 pedido não foi feito · 1 pedido realizado/);assert.equal(carrierNoticeContent(mixed).systemTitle,'2 pedidos atualizados');
const allDeclined=schedulingNotice([statusEvent,{...statusEvent,id:'other',seq:2}],true);assert.equal(carrierNoticeContent(allDeclined).systemTitle,'2 pedidos não foram feitos');
assert.equal(schedulingNotice([{...statusEvent,status:'pending'}],true),null);assert.equal(schedulingNotice([],true),null);
const managerNotice=schedulingNotice([{...statusEvent,status:'pending'}],false);assert.equal(managerNotice.count,1);assert.equal(managerNotice.request.status,'pending');
const restored=new BrowserAlerts(f.platform,()=>{}); restored.start();
assert.equal(restored.settings.enabled,true); // refresh preserves an explicit activation
await restored.recover();restored.play();assert.equal(f.contexts[1].plays,2);
restored.pause();restored.play();assert.equal(f.contexts[1].plays,2);assert.equal(restored.show('Pausado',{},()=>{}),false);
restored.dispose();
const paused=new BrowserAlerts(f.platform,()=>{});paused.start();assert.equal(paused.settings.enabled,false);paused.dispose();
const blocked=fixture({stored:true,suspended:true});const background=new BrowserAlerts(blocked.platform,()=>{});background.start();
await background.recover();assert.equal(background.settings.sound,'blocked');background.play();
assert.equal(background.show('Novo pedido de Scheduling',{},()=>{}),true); // desktop notice independent of suspended sound
assert.equal(blocked.contexts[0].plays,0);
blocked.gesture();await background.recover();assert.equal(background.settings.sound,'ready');assert.equal(blocked.contexts[0].plays,2);
await background.recover();assert.equal(blocked.contexts[0].plays,2); // one pending chime, no duplicate recovery sound
blocked.contexts[0].state='suspended';blocked.contexts[0].onstatechange();background.play();await background.recover();assert.equal(blocked.contexts[0].plays,4);
background.dispose();
const unavailable=fixture({stored:true,brokenAudio:true});const desktopOnly=new BrowserAlerts(unavailable.platform,()=>{});
desktopOnly.start();await desktopOnly.enable();assert.equal(desktopOnly.settings.sound,'unavailable');assert.equal(desktopOnly.show('Novo pedido de Scheduling',{},()=>{}),true);desktopOnly.dispose();
const denied=fixture({permission:'denied'});const soundOnly=new BrowserAlerts(denied.platform,()=>{});await soundOnly.enable();soundOnly.play();assert.equal(denied.contexts[0].plays,2);assert.equal(soundOnly.show('Sem permissão',{},()=>{}),false);soundOnly.dispose();
const values=new Map();const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
assert.equal(readAlertCursor(storage,'manager',1000),null);
saveAlertCursor(storage,'manager',12,1000);assert.equal(readAlertCursor(storage,'manager',1100),12);
assert.equal(readAlertCursor(storage,'carrier:alc',1100),null); // no cross-role checkpoint
saveAlertCursor(storage,'manager',13,1200);assert.equal(readAlertCursor(storage,'manager',1300),13);
assert.equal(readAlertCursor(storage,'manager',1200+86400000),null);
values.set('dispo:alert-cursor:v1:manager','bad json');assert.equal(readAlertCursor(storage,'manager'),null);
const locked={getItem(){throw new Error('Storage blocked');},setItem(){throw new Error('Storage blocked');}};
assert.equal(readAlertCursor(locked,'manager'),null);saveAlertCursor(locked,'manager',1);
// Existing browser permission migrates the old, memory-only activation.
const platformValues=new Map();
globalThis.localStorage={getItem:key=>platformValues.get(key)??null,setItem:(key,value)=>platformValues.set(key,value)};
globalThis.Notification={permission:'granted',requestPermission:async()=>'granted'};
const browserWindow={isSecureContext:true,Notification:globalThis.Notification};browserWindow.top=browserWindow;browserWindow.self=browserWindow;globalThis.window=browserWindow;
const managerPlatform=browserAlertPlatform('manager');assert.equal(managerPlatform.readEnabled(),true);
managerPlatform.writeEnabled(false);assert.equal(managerPlatform.readEnabled(),false);
assert.equal(browserAlertPlatform('carrier:alc').readEnabled(),true);
managerPlatform.writeEnabled(true);assert.equal(managerPlatform.readEnabled(),true);
globalThis.Notification.permission='default';browserWindow.top={};assert.equal(managerPlatform.permission(),'unavailable');
const pending=fixture({stored:true,suspended:true});pending.platform.createAudio=()=>({state:'suspended',onstatechange:null,resume:()=>new Promise(()=>{}),close:async()=>{}});
const waits=new BrowserAlerts(pending.platform,()=>{});await waits.enable();assert.equal(waits.settings.sound,'blocked');assert.equal(waits.show('Novo pedido',{},()=>{}),true);waits.dispose();
console.log('PASS: Feito e Não feito geram alertas; texto explícito e motivo preservados; correções e lotes mistos não são confundidos; ativação e pausa persistem; áudio e aviso externo independentes; cursor por guia e papel.');

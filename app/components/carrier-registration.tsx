"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Building2, CheckCircle2, Copy, ImagePlus, Info, LoaderCircle, Plus, RefreshCw, Search, Trash2, UploadCloud } from "lucide-react";
import { type Carrier } from "@/lib/model";
import { carrierSlug } from "@/lib/carrier-registration-model";
import { prepareLogo, type PreparedLogo } from "@/lib/prepare-logo";
import { newRequestId } from "@/lib/request-id";
import CarrierLogo, { CarrierLogoFrame } from "./carrier-logo";
import { useCarrierCatalog } from "./carrier-catalog";
type Result = { carrier: Carrier; path: string; replay?: boolean };
export default function CarrierRegistration({ endpoint = "/api/gestao/transportadoras", onRegistered, onManageModals }: { endpoint?: string; onRegistered?: (carrier: Carrier) => void; onManageModals?: (slug: string) => void }) {
  const { carriers, replaceCarriers, upsertCarrier } = useCarrierCatalog();
  const [name,setName]=useState(""); const [file,setFile]=useState<File|null>(null); const [logo,setLogo]=useState<PreparedLogo|null>(null);
  const [imageLoading,setImageLoading]=useState(false); const [imageError,setImageError]=useState("");
  const [saving,setSaving]=useState(false); const [error,setError]=useState(""); const [result,setResult]=useState<Result|null>(null);
  const [links,setLinks]=useState<Record<string,string>>({}); const [loading,setLoading]=useState(true); const [listError,setListError]=useState("");
  const [reload,setReload]=useState(0); const [search,setSearch]=useState(""); const [copied,setCopied]=useState(""); const [origin,setOrigin]=useState("");
  const input=useRef<HTMLInputElement>(null); const attempt=useRef<string|null>(null); const imageVersion=useRef(0);
  useEffect(()=>{setOrigin(window.location.origin);return()=>{imageVersion.current++;};},[]);
  useEffect(()=>()=>{if(logo)URL.revokeObjectURL(logo.url);},[logo]);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setListError("");
    fetch(endpoint,{cache:"no-store",signal:controller.signal}).then(async response=>{
      const body=await response.json() as {carriers:Carrier[];links:{slug:string;path:string}[];error?:string};
      if(!response.ok)throw new Error(body.error||"Não foi possível carregar as transportadoras.");
      if(controller.signal.aborted)return;replaceCarriers(body.carriers);setLinks(Object.fromEntries(body.links.map(link=>[link.slug,link.path])));
    }).catch(cause=>{if(!controller.signal.aborted)setListError(cause instanceof Error?cause.message:"Falha de conexão.");}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[endpoint,reload,replaceCarriers]);
  useEffect(()=>{if(!copied)return;const timer=setTimeout(()=>setCopied(""),3000);return()=>clearTimeout(timer);},[copied]);
  function dirty(){attempt.current=null;setError("");}
  async function selectFile(selected:File|undefined){
    const version=++imageVersion.current;setLogo(null);setFile(null);setImageError("");dirty();
    if(!selected){setImageLoading(false);return;}setImageLoading(true);
    try{const prepared=await prepareLogo(selected);if(version!==imageVersion.current){URL.revokeObjectURL(prepared.url);return;}setLogo(prepared);setFile(selected);}
    catch(cause){if(version===imageVersion.current)setImageError(cause instanceof Error?cause.message:"Não foi possível abrir a imagem.");}
    finally{if(version===imageVersion.current)setImageLoading(false);}
  }
  async function submit(event:React.FormEvent<HTMLFormElement>){
    event.preventDefault();if(saving||imageLoading||imageError||result)return;
    attempt.current??=newRequestId();setSaving(true);setError("");
    const form=new FormData();form.set("id",attempt.current);form.set("name",name);
    if(file&&logo){form.set("logo",file);form.set("logoFrame",JSON.stringify(logo.frame));}
    try{
      const response=await fetch(endpoint,{method:"POST",body:form});const body=await response.json() as Result&{error?:string};
      if(!response.ok)throw new Error(body.error||"O cadastro ainda não foi confirmado.");
      upsertCarrier(body.carrier);setLinks(current=>({...current,[body.carrier.slug]:body.path}));setResult(body);onRegistered?.(body.carrier);setReload(value=>value+1);
    }catch(cause){setError(cause instanceof Error?cause.message:"Verifique a conexão e tente novamente para confirmar o cadastro.");}
    finally{setSaving(false);}
  }
  async function copy(path:string,slug:string){try{await navigator.clipboard.writeText(origin+path);setCopied(slug);}catch{setError("Não foi possível copiar. Selecione o endereço do link e copie.");}}
  function another(){setResult(null);setName("");setLogo(null);setFile(null);setImageError("");setError("");attempt.current=null;if(input.current)input.current.value="";}
  const slug=carrierSlug(name)||"nome-da-transportadora";
  const previewLogo=logo?{src:logo.url,width:logo.width,height:logo.height,viewBox:`${logo.frame.x} ${logo.frame.y} ${logo.frame.width} ${logo.frame.height}`,background:logo.frame.background}:undefined;
  const visible=carriers.filter(carrier=>carrier.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  return <div className="carrier-registration">
    <div className="registration-layout"><section className="form-card registration-form-card">
      <div className="section-title"><span className="step-number"><Building2 size={17}/></span><div><h2>{result?"Cadastro concluído":"Nova transportadora"}</h2><p>{result?"O painel e o link exclusivo já estão disponíveis.":"Informe o nome e, se desejar, anexe a logo."}</p></div></div>
      {result?<div className="registration-result"><span className="registration-success-icon"><CheckCircle2 size={28}/></span><h3>{result.carrier.name} cadastrada!</h3><p>Copie o link e envie no grupo desta transportadora.</p><label className="field-label" htmlFor="registered-carrier-link">Link exclusivo da transportadora<input id="registered-carrier-link" readOnly value={origin+result.path} onFocus={event=>event.target.select()}/></label><div className="registration-result-actions"><button className="button primary" onClick={()=>void copy(result.path,result.carrier.slug)}><Copy size={16}/>{copied===result.carrier.slug?"Link copiado!":"Copiar link"}</button><a className="button secondary" href={result.path} target="_blank" rel="noreferrer">Abrir painel<ArrowUpRight size={16}/></a></div><p className="registration-modal-note"><Info size={15}/>A disponibilidade já pode ser preenchida. Para pedidos de Scheduling, selecione e salve os modais da transportadora na Base de modais.</p>{onManageModals&&<button className="button secondary full registration-configure-modals" onClick={()=>onManageModals(result.carrier.slug)}><Plus size={16}/>Configurar modais desta transportadora</button>}<button className="text-button" onClick={another}><Plus size={16}/>Cadastrar outra transportadora</button></div>:<form onSubmit={submit}>
        <label className="field-label" htmlFor="new-carrier-name">Nome da transportadora<input id="new-carrier-name" required minLength={2} maxLength={80} placeholder="Ex.: Nova Transportadora" autoComplete="organization" value={name} disabled={saving} onChange={event=>{setName(event.target.value);dirty();}}/></label>
        <div className="registration-upload-heading"><strong>Logo da transportadora</strong><span>opcional</span></div><label className={"registration-upload "+(logo?"has-logo":"")} htmlFor="new-carrier-logo">{logo?<CarrierLogoFrame logo={previewLogo} initials="TP" label={name||"Prévia"} size="portal"/>:<span className="upload-icon">{imageLoading?<LoaderCircle className="spin" size={27}/>:<UploadCloud size={28}/>}</span>}<strong>{imageLoading?"Preparando imagem...":file?file.name:"Clique para anexar a logo"}</strong><span>PNG, JPG ou WebP · Até 2 MB</span><input ref={input} id="new-carrier-logo" aria-label="Anexar logo da transportadora" type="file" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp" disabled={saving||imageLoading} onChange={event=>void selectFile(event.target.files?.[0])}/></label>
        {(file||imageError)&&<button className="registration-remove-logo" type="button" disabled={saving} onClick={()=>{void selectFile(undefined);if(input.current)input.current.value="";}}><Trash2 size={14}/>Remover imagem</button>}{imageError&&<p className="registration-field-error" role="alert">{imageError}</p>}
        {error&&<div className="dashboard-alert" role="alert">{error}</div>}
        <button className="button primary full registration-submit" type="submit" disabled={saving||imageLoading||!!imageError||name.trim().length<2}>{saving?<><LoaderCircle className="spin" size={17}/>Cadastrando...</>:<><Plus size={18}/>Cadastrar e gerar link</>}</button><p className="registration-help"><Info size={14}/>O link será criado automaticamente e ficará disponível também em Links de coleta.</p>
      </form>}{result&&error&&<div className="dashboard-alert" role="alert">{error}</div>}
    </section><aside className="registration-preview"><span className="eyebrow">PRÉVIA DO CADASTRO</span>{result?<CarrierLogo slug={result.carrier.slug} size="portal"/>:<CarrierLogoFrame logo={previewLogo} initials={name.trim().slice(0,2).toUpperCase()||"TP"} label={name||"Transportadora"} size="portal"/>}<h3>{result?.carrier.name||name.trim()||"Sua transportadora"}</h3><span className="registration-access-badge"><CheckCircle2 size={13}/>Link exclusivo</span><div className="registration-preview-path">/t/{result?.carrier.slug||slug}</div><p>A transportadora acessa o painel pelo próprio link, sem precisar criar uma conta.</p><div className="registration-preview-detail"><ImagePlus size={18}/><span>Logo com proporção preservada e enquadramento ajustado.</span></div></aside></div>
    <section className="table-panel registration-list"><div className="panel-heading"><div><h2>Transportadoras cadastradas<span className="count-badge">{carriers.length}</span></h2><p>Os cadastros existentes e seus links ficam disponíveis aqui.</p></div><button className="icon-button" aria-label="Atualizar cadastros" disabled={loading} onClick={()=>setReload(value=>value+1)}><RefreshCw size={17} className={loading?"spin":""}/></button></div><div className="table-controls"><label className="search-input"><Search size={15}/><input aria-label="Buscar cadastro de transportadora" placeholder="Buscar por nome" value={search} onChange={event=>setSearch(event.target.value)}/></label><span className="registration-list-count">{visible.length} transportadora{visible.length===1?"":"s"}</span></div>{listError&&<div className="dashboard-alert" role="alert">{listError}</div>}<div className="table-scroll"><table><thead><tr><th>TRANSPORTADORA</th><th>PAINEL</th><th>LINK DE ACESSO</th></tr></thead><tbody>{visible.map(carrier=><tr key={carrier.slug}><td><div className="carrier-cell"><CarrierLogo slug={carrier.slug}/><span><strong>{carrier.name}</strong><small>/t/{carrier.slug}</small></span></div></td><td><span className="status-badge received"><span/>Disponível</span></td><td><div className="registration-row-actions">{onManageModals&&<button className="button secondary small" onClick={()=>onManageModals(carrier.slug)}>Gerenciar modais</button>}<button className="button secondary small" disabled={!links[carrier.slug]} onClick={()=>void copy(links[carrier.slug],carrier.slug)}><Copy size={14}/>{copied===carrier.slug?"Copiado!":"Copiar link"}</button>{links[carrier.slug]&&<a className="icon-button" href={links[carrier.slug]} target="_blank" rel="noreferrer" aria-label={`Abrir painel ${carrier.name}`}><ArrowUpRight size={16}/></a>}</div></td></tr>)}</tbody></table>{!visible.length&&<div className="table-empty"><Building2 size={26}/><p>Nenhuma transportadora encontrada.</p></div>}</div></section>
  </div>;
}

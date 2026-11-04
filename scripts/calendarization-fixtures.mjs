import { getISOWeek } from "date-fns";
const toCsv = rows => rows.map(row => row.map(value => '"' + String(value).replaceAll('"', '""') + '"').join(",")).join("\r\n");
const day = (monday, offset) => new Date(Date.parse(monday + "T12:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
export function calendarFixtures(monday = "2026-10-19") {
  const dates = Array.from({ length: 7 }, (_, index) => day(monday, index));
  const week = getISOWeek(new Date(monday + "T12:00:00Z"));
  const ffHeader = ["Regional", "Macro Regional", "Base 0 | Inventário de Placas", "XPT", "Facility final", "Cadastro como Deveria Ser", "Modal reserva como deveria ser", "Placa", "Cadastro Final", "MLP", "Contrato", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sabado", "Domingo", "Semana"];
  const ffRow = (plate, carrier = "A L C TRANSPORTES", modal = "Vuc Rental TKS", facility = "SMG1", days = ["AM1", "PM1", "Folga", "AM1", "CHP", "SD", "AM1"]) => ["RIMES", "RIMES", facility, "", facility, modal, "", plate, modal, carrier, "8h", ...days, week];
  const ff = toCsv([ffHeader, ffRow("ABC1234"), ffRow("DEF1A23", "Hawk Transportes"), ffRow("GHI1B23", "A L C TRANSPORTES", "VUC Dedicado com Ajudante"), ffRow("JKL1C23", "A L C TRANSPORTES", "Vuc Rental TKS", "SMG2"), ffRow("MNO1D23"), ffRow("MNO1D23", "A L C TRANSPORTES", "Vuc Rental TKS", "SMG1", ["PM1", "PM1", "Folga", "AM1", "CHP", "SD", "AM1"])]);
  const sddHeader = ["REGIONAL", "Saída LM", "MLP", "Cadatro", "Ciclo", ...dates.map(date => `${date.slice(8,10)}/${date.slice(5,7)}/${date.slice(0,4)}`), "Ultima Atualização", "Total Semana"];
  const sdd = toCsv([sddHeader, ["RIMES", "SMG1", "A L C TRANSPORTES", "VUC PP SDD", "AM1", 3, 3, 0, "", 3, 3, 3, "15/10/2026", 18], ["RIMES", "SMG1", "A L C TRANSPORTES", "UTILITÁRIOS SDD", "PM1", 4, 4, 4, 4, 4, 4, 0, "15/10/2026", 24], ["RIMES", "SMG2", "A L C TRANSPORTES", "VUC PP SDD", "AM1", 999, 999, 999, 999, 999, 999, 999, "15/10/2026", 6993]]);
  return { ff, sdd, dates, week };
}

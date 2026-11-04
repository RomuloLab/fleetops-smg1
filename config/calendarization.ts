// Read-only source supplied by the operation. All queries and local checks are
// restricted to SMG1; other facilities are never used as a fallback.
export const CALENDARIZATION_SOURCE = {
  spreadsheetId: "1rVU5BHcfoffg-DHknh1disQBzP3P0wVA",
  url: "https://docs.google.com/spreadsheets/d/1rVU5BHcfoffg-DHknh1disQBzP3P0wVA/edit?gid=801104757#gid=801104757",
  facility: "SMG1", ffGid: "801104757", sddGid: "1533539391",
} as const;
// Only names actually observed in the supplied source are aliases. A new
// carrier still matches its exact normalized display name or slug.
export const CALENDARIZATION_CARRIER_ALIASES: Record<string, readonly string[]> = {
  ado: ["ADO TRANSPORTADORA"], alc: ["A L C TRANSPORTES"], basepex: ["BASEPEX ENCOM"],
  bld: ["BLD LOGÍSTICA"], caxiense: ["CAXIENSE LOG"], coopmetro: ["COOPMETRO"],
  decargo: ["DECARGO"], "help-me": ["HELP ME SOLUCOES"], hawk: ["Hawk Transportes"],
  imediato: ["TRANSPORTADORA GRUPO IMEDIATO"], kangu: ["KANGU LOGISTICS"],
  rodacoop: ["RodaCoop"], spot: ["PARCEIRO SPOT SOLUCOES"],
};

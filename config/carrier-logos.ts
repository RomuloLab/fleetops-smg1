export type CarrierLogoAsset = { src: string; width: number; height: number; viewBox: string; background: string };
// The original uploads stay intact. Viewports remove only the surrounding
// empty margins, retaining each complete mark and its original colors.
export const CARRIER_LOGOS: Record<string, CarrierLogoAsset> = {
  ado: { src: "/logos/carriers/ado.jpg", width: 400, height: 400, viewBox: "0 65 400 270", background: "#ffffff" },
  alc: { src: "/logos/carriers/alc.png", width: 554, height: 554, viewBox: "66 61 424 432", background: "#000000" },
  basepex: { src: "/logos/carriers/basepex.webp", width: 200, height: 200, viewBox: "30 66 140 70", background: "#010101" },
  bld: { src: "/logos/carriers/bld.jpg", width: 1000, height: 1000, viewBox: "265 70 470 790", background: "#ffffff" },
  decargo: { src: "/logos/carriers/decargo.png", width: 500, height: 250, viewBox: "0 38 500 178", background: "#ffffff" },
  dhl: { src: "/logos/carriers/dhl.webp", width: 1280, height: 720, viewBox: "182 208 916 304", background: "#ffcc00" },
  "help-me": { src: "/logos/carriers/help-me.png", width: 608, height: 328, viewBox: "46 52 514 223", background: "#ffffff" },
  hawk: { src: "/logos/carriers/hawk.jpg", width: 447, height: 447, viewBox: "76 116 294 214", background: "#114a8f" },
  imediato: { src: "/logos/carriers/imediato.jpg", width: 447, height: 447, viewBox: "16 148 416 150", background: "#001b30" },
  kangu: { src: "/logos/carriers/kangu.jpg", width: 700, height: 700, viewBox: "160 138 382 421", background: "#f8f8f8" },
  rodacoop: { src: "/logos/carriers/rodacoop.png", width: 447, height: 447, viewBox: "0 0 447 447", background: "#ffffff" },
  spot: { src: "/logos/carriers/spot.png", width: 240, height: 240, viewBox: "5 55 230 130", background: "#fefefe" },
};

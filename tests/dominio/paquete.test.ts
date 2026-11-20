import { existsSync, readdirSync, readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { armarPaquete, simularEnvio } from "../../src/dominio/paquete";
import { crearEntorno } from "../apoyo/entorno";

const entorno = crearEntorno("paquete");
afterAll(() => entorno.limpiar());

describe("paquete para firma (oráculo tabla 2.4)", () => {
  it.each([
    { caso: "co-industrias-delta", septiembre: true, noviembre: false },
    { caso: "ec-corp-andina", septiembre: false, noviembre: false },
    { caso: "hn-agroexport-sula", septiembre: false, noviembre: false },
    { caso: "pa-logistica-istmo", septiembre: true, noviembre: false },
  ])("$caso: listo_para_firma $septiembre (2026-09-03) / $noviembre (2026-11-20)", async ({ caso, septiembre, noviembre }) => {
    const conSeptiembre = await armarPaquete(entorno.ctx, caso, "2026-09-03");
    const conNoviembre = await armarPaquete(entorno.ctx, caso, "2026-11-20");
    expect(conSeptiembre.ok && conSeptiembre.data.listo_para_firma).toBe(septiembre);
    expect(conNoviembre.ok && conNoviembre.data.listo_para_firma).toBe(noviembre);
  });

  it("el borrador de correo no contiene datos bancarios (RN2)", async () => {
    const resultado = await armarPaquete(entorno.ctx, "co-industrias-delta", "2026-09-03");
    expect(resultado.ok).toBe(true);
    const correo = readFileSync(entorno.rutaOut("co-industrias-delta/paquete/borrador-correo.md"), "utf8");
    expect(correo).toContain("Para: compras@industrias-delta-ficticia.com");
    for (const prohibido of ["03100012345", "COLOCOBM", "Bancolombia", "Ahorros"]) expect(correo).not.toContain(prohibido);
  });

  it("ec-corp-andina: certificado_cumplimiento_tributario ausente, faltante y pendiente en el checklist", async () => {
    const resultado = await armarPaquete(entorno.ctx, "ec-corp-andina", "2026-09-03");
    if (!resultado.ok) throw new Error(resultado.error);
    const ausente = resultado.data.checklist.soportes.find((s) => s.tipo === "certificado_cumplimiento_tributario");
    expect(ausente?.estado).toBe("ausente");
    expect(resultado.data.checklist.campos_faltantes).toEqual(["Número de contribuyente especial"]);
    const md = readFileSync(entorno.rutaOut("ec-corp-andina/paquete/checklist.md"), "utf8");
    expect(md).toContain("| certificado_cumplimiento_tributario | ausente |");
    expect(md).toContain("RUC: identificador extranjero (se esperaba RUC)");
    expect(readdirSync(entorno.rutaOut("ec-corp-andina/paquete"))).toContain("formulario.pdf");
  });

  it("hn-agroexport-sula: copia el soporte vencido, lo marca y anota el emisor CO", async () => {
    const resultado = await armarPaquete(entorno.ctx, "hn-agroexport-sula", "2026-09-03");
    if (!resultado.ok) throw new Error(resultado.error);
    expect(resultado.data.archivos).toContain("parafiscales-2026-07.txt");
    const md = readFileSync(entorno.rutaOut("hn-agroexport-sula/paquete/checklist.md"), "utf8");
    expect(md).toContain("| parafiscales | vencido | parafiscales-2026-07.txt | 2026-08-31 |");
    expect(md).toContain("emitido en CO; el cliente es de HN");
  });

  it("co-industrias-delta: anota la exigencia de 'no mayor a 30 días'", async () => {
    const resultado = await armarPaquete(entorno.ctx, "co-industrias-delta", "2026-09-03");
    expect(resultado.ok && resultado.data.checklist.notas[0]).toContain("no mayor a 30 días");
  });

  it("caso inexistente devuelve error claro sin crear carpeta", async () => {
    expect(await armarPaquete(entorno.ctx, "no-existe", "2026-09-03")).toEqual({ ok: false, error: "El caso 'no-existe' no existe" });
    expect(existsSync(entorno.rutaOut("no-existe"))).toBe(false);
  });

  it("simularEnvio exige un paquete armado y advierte si no está listo", async () => {
    const limpio = crearEntorno("paquete-envio");
    const sinPaquete = await simularEnvio(limpio.ctx, "pa-logistica-istmo", "2026-09-03");
    expect(sinPaquete.ok).toBe(false);
    expect(existsSync(limpio.rutaOut("pa-logistica-istmo/ENVIO-SIMULADO.md"))).toBe(false);
    await armarPaquete(limpio.ctx, "hn-agroexport-sula", "2026-09-03");
    const envio = await simularEnvio(limpio.ctx, "hn-agroexport-sula", "2026-09-03");
    limpio.limpiar();
    expect(envio).toMatchObject({ ok: true, data: { ruta: "out/hn-agroexport-sula/ENVIO-SIMULADO.md", listo_para_firma: false } });
    expect(envio.ok && envio.data.advertencia).toContain("parafiscales vencido");
  });
});

import { z } from "zod";

// Mensajes de validación de zod en español (los lee la analista y el modelo).
z.config(z.locales.es());

/** Formatos de salida que puede pedir un cliente. */
export const FORMATOS = ["xlsx", "pdf", "portal"] as const;
export const esquemaFormato = z.enum(FORMATOS);
export type Formato = z.infer<typeof esquemaFormato>;

const CELDA = /^[A-Z]{1,3}[1-9][0-9]*$/;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const NOMBRE_ARCHIVO = /^[A-Za-z0-9._-]+$/;

const textoNoVacio = z.string().trim().min(1, "no puede estar vacío");

/** Correo normalizado del cliente (`solicitud.json`). */
export const esquemaSolicitud = z.object({
  id: textoNoVacio,
  de: textoNoVacio,
  para: z.string().optional(),
  asunto: z.string(),
  fecha: z.string(),
  pais: z.string().regex(/^[A-Z]{2}$/, "debe ser un código de país de 2 letras"),
  cliente: textoNoVacio,
  formato: esquemaFormato,
  cuerpo: z.string(),
  adjuntos: z.array(z.string()),
});
export type Solicitud = z.infer<typeof esquemaSolicitud>;

/** Celda de una plantilla Excel (`plantilla-celdas.json`). */
export const esquemaCelda = z.object({
  hoja: textoNoVacio,
  celda_etiqueta: z.string().regex(CELDA, "debe ser una referencia de celda como B3"),
  etiqueta: textoNoVacio,
  celda_valor: z.string().regex(CELDA, "debe ser una referencia de celda como C3"),
});
export const esquemaPlantillaCeldas = z.array(esquemaCelda).min(1, "la plantilla no tiene celdas");
export type CeldaPlantilla = z.infer<typeof esquemaCelda>;

/** Campo de una plantilla PDF o portal (`plantilla-campos.json`). */
export const esquemaCampo = z.object({
  etiqueta: textoNoVacio,
  obligatorio: z.boolean(),
});
export const esquemaPlantillaCampos = z.array(esquemaCampo).min(1, "la plantilla no tiene campos");
export type CampoPlantilla = z.infer<typeof esquemaCampo>;

/** Tipos de soporte exigidos (`soportes-exigidos.json`). */
export const esquemaSoportesExigidos = z.array(textoNoVacio);

/** Valor escalar del maestro. */
export type Escalar = string | number | boolean | null;
/** Valor del maestro: escalar, lista de escalares o registro anidado. */
export type ValorMaestro = Escalar | Escalar[] | { [clave: string]: ValorMaestro };

const esquemaEscalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const esquemaValorMaestro: z.ZodType<ValorMaestro> = z.lazy(() =>
  z.union([esquemaEscalar, z.array(esquemaEscalar), z.record(z.string(), esquemaValorMaestro)]),
);

/** Repositorio maestro de Periferia (`maestro.json`). */
export const esquemaMaestro = z.record(z.string(), esquemaValorMaestro);
export type Maestro = z.infer<typeof esquemaMaestro>;

/** Entrada del índice de soportes (`soportes/index.json`). */
export const esquemaSoporte = z.object({
  tipo: textoNoVacio,
  archivo: z.string().regex(NOMBRE_ARCHIVO, "debe ser un nombre de archivo sin carpetas"),
  vigencia_hasta: z.string().regex(FECHA_ISO, "debe tener formato AAAA-MM-DD").nullable(),
  pais_emisor: z.string(),
  descripcion: z.string(),
});
export const esquemaIndiceSoportes = z.array(esquemaSoporte);
export type SoporteIndice = z.infer<typeof esquemaSoporte>;

/** Glosario de sinónimos: etiqueta del cliente → ruta del maestro. */
export const esquemaGlosario = z.record(z.string(), textoNoVacio);
export type Glosario = z.infer<typeof esquemaGlosario>;

/** Describe los problemas de validación en una línea legible, sin traza. */
export function describirErrorZod(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const ruta = issue.path.length > 0 ? issue.path.join(".") : "(raíz)";
      return `${ruta}: ${issue.message}`;
    })
    .join("; ");
}

import type { Config } from "../config";
import type { AdaptadorLLM } from "./adapter";
import { ErrorLLM } from "./adapter";
import { crearAdaptadorAnthropic, PROVEEDOR_ANTHROPIC } from "./anthropic";

export const MENSAJE_SIN_CLAVE = "Falta ANTHROPIC_API_KEY en el servidor: el agente no puede consultar el modelo. Defínela en el entorno del backend y reinícialo.";

/** Adaptador que responde siempre el error de configuración, para que `/api/health` y la sesión sigan vivos. */
function adaptadorSinClave(modelo: string): AdaptadorLLM {
  return {
    proveedor: PROVEEDOR_ANTHROPIC,
    modelo,
    enviar: () => Promise.reject(new ErrorLLM("autenticacion", MENSAJE_SIN_CLAVE)),
  };
}

/** Crea el adaptador del proveedor configurado. */
export function crearAdaptador(config: Pick<Config, "claveApi" | "modelo" | "timeoutMs">): AdaptadorLLM {
  if (config.claveApi === undefined) return adaptadorSinClave(config.modelo);
  return crearAdaptadorAnthropic({ claveApi: config.claveApi, modelo: config.modelo, timeoutMs: config.timeoutMs });
}

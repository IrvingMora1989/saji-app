import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mqjjmcmtpkfkywaevcva.supabase.co'
const SUPABASE_KEY = 'sb_publishable_ZHeoC43TemFetElGZ6fLaw_rEhkGblb'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────
// Cada "tabla" guarda una sola fila con id='main' y data=array completo.
// Como se escribe el arreglo entero, dos equipos trabajando a la vez se pisaban:
// el último en guardar borraba lo que el otro había agregado. Para evitarlo se
// relee el servidor justo antes de escribir y se fusiona registro por registro.

// Referencia: los registros que ESTE equipo ya conocía. Lo que está aquí y
// desapareció de la pantalla es un borrado de verdad; lo que llegó al servidor
// y nunca estuvo aquí lo puso alguien más y no se debe tocar.
// La regla es una sola: marcarBase() se llama cada vez que la pantalla toma
// datos del servidor. Si se marca de más, se borra lo ajeno.
const base = new Map()   // tabla -> Map(id -> JSON del registro)

const idDe = r => (r && r.id != null) ? String(r.id) : null

export function marcarBase(tabla, arr) {
  if (!Array.isArray(arr)) return
  const m = new Map()
  for (const r of arr) { const i = idDe(r); if (i) m.set(i, JSON.stringify(r)) }
  base.set(tabla, m)
}

export function fusionar(tabla, servidor, local, ref = base.get(tabla)) {
  // Sin referencia no se puede saber qué se borró: se respeta lo local.
  if (!ref) return local
  // Si algún registro no trae id no hay forma segura de fusionar.
  if (servidor.some(r => !idDe(r)) || local.some(r => !idDe(r))) return local

  const locM = new Map()
  for (const r of local) locM.set(idDe(r), r)
  const idsServidor = new Set(servidor.map(idDe))

  const salida = []
  const puestos = new Set()
  for (const r of servidor) {
    const i = idDe(r)
    if (locM.has(i)) {
      const l = locM.get(i)
      const loCambieYo = ref.has(i) && ref.get(i) !== JSON.stringify(l)
      salida.push(loCambieYo ? l : r)      // si yo no lo toqué, gana el servidor
      puestos.add(i)
    } else if (ref.has(i)) {
      continue                              // yo lo conocía y lo borré
    } else {
      salida.push(r)                        // nunca lo vi: lo puso otro equipo
    }
  }
  // Lo que capturé yo y el servidor todavía no tenía, al frente
  const nuevos = local.filter(r => !puestos.has(idDe(r)) && !idsServidor.has(idDe(r)))
  return [...nuevos, ...salida]
}

export async function loadTable(tabla) {
  try {
    const { data, error } = await supabase
      .from(tabla)
      .select('data')
      .eq('id', 'main')
      .single()
    if (error || !data) return null
    return data.data
  } catch (e) {
    console.error(`Error cargando ${tabla}:`, e)
    return null
  }
}

// Devuelve { ok, data, fusionado } o { ok:false, error } para que la app pueda
// reintentar, avisar en pantalla y adoptar lo que otro equipo haya agregado.
export async function saveTable(tabla, array) {
  try {
    let final = array
    let fusionado = false

    if (Array.isArray(array)) {
      const { data: fila, error: eLeer } = await supabase
        .from(tabla).select('data').eq('id', 'main').maybeSingle()
      // Si la lectura falla no se escribe a ciegas: se reintenta después.
      if (eLeer) return { ok: false, error: eLeer.message || 'No se pudo leer antes de guardar' }
      const servidor = fila && Array.isArray(fila.data) ? fila.data : null
      if (servidor) {
        final = fusionar(tabla, servidor, array)
        fusionado = JSON.stringify(final) !== JSON.stringify(array)
      }
    }

    const { error } = await supabase
      .from(tabla)
      .upsert({ id: 'main', data: final, updated_at: new Date().toISOString() })
    if (error) {
      console.error(`Error guardando ${tabla}:`, error)
      return { ok: false, error: error.message || 'Error al guardar' }
    }
    // Referencia = lo que esta pantalla tiene, no lo fusionado. Si la app adopta
    // el resultado, vuelve a marcar ella.
    marcarBase(tabla, array)
    return { ok: true, data: final, fusionado }
  } catch (e) {
    console.error(`Error guardando ${tabla}:`, e)
    return { ok: false, error: String(e?.message || e) }
  }
}

// Escucha cambios en tiempo real de una tabla
export function subscribeTable(tabla, callback) {
  return supabase
    .channel(`realtime-${tabla}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: tabla },
      payload => { if (payload.new?.data) callback(payload.new.data) }
    )
    .subscribe()
}

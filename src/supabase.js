import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://mqjjmcmtpkfkywaevcva.supabase.co'
const SUPABASE_KEY = 'sb_publishable_ZHeoC43TemFetElGZ6fLaw_rEhkGblb'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// ── Helpers ───────────────────────────────────────────────────────────────────
// Cada "tabla" guarda una sola fila con id='main' y data=array completo.
// Esto es simple y funciona perfecto para este volumen de datos.

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

// Devuelve { ok:true } o { ok:false, error } para que la app pueda reintentar
// y avisar en pantalla. Antes se tragaba el error y el cambio se perdía
// en silencio cuando fallaba la señal.
export async function saveTable(tabla, array) {
  try {
    const { error } = await supabase
      .from(tabla)
      .upsert({ id: 'main', data: array, updated_at: new Date().toISOString() })
    if (error) {
      console.error(`Error guardando ${tabla}:`, error)
      return { ok: false, error: error.message || 'Error al guardar' }
    }
    return { ok: true }
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
      payload => {
        if (payload.new?.data) callback(payload.new.data)
      }
    )
    .subscribe()
}

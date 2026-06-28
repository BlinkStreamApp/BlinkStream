// ============================================================
// Validadores runtime de props (M-7 / Auditoria WT-20260628-01)
// ============================================================
// El proyecto es JS sin TypeScript, asi que no tenemos chequeo
// estatico de tipos. Esta capa minimalista de validacion runtime
// cubre los puntos criticos donde llegan datos externos
// (invoke de Tauri, respuestas fetch, props de componentes externos).
//
// NO es un prop-types reemplazo completo: solo lo que DUele.
// Uso: validateProps({ channel, quality }, { channel: isString, quality: isOneOf(['1080p60','720p60','best']) })
// ============================================================

/**
 * @typedef {object} Validator
 * @property {(value: any) => boolean} check   - Funcion de validacion
 * @property {string}                   name   - Nombre legible del tipo para el mensaje
 * @property {boolean}                  [optional] - Si true, acepta undefined/null
 */

/**
 * @param {string} typeName
 * @returns {Validator}
 */
function make(typeName) {
  return { check: () => true, name: typeName }
}

/**
 * Validador: valor debe ser un string.
 * @type {Validator}
 */
export const isString = (() => {
  const v = make('string')
  v.check = (val) => typeof val === 'string'
  return v
})()

/**
 * Validador: valor debe ser un number finito.
 * @type {Validator}
 */
export const isNumber = (() => {
  const v = make('number')
  v.check = (val) => typeof val === 'number' && Number.isFinite(val)
  return v
})()

/**
 * Validador: valor debe ser un boolean.
 * @type {Validator}
 */
export const isBoolean = (() => {
  const v = make('boolean')
  v.check = (val) => typeof val === 'boolean'
  return v
})()

/**
 * Validador: valor debe ser un array.
 * @type {Validator}
 */
export const isArray = (() => {
  const v = make('array')
  v.check = (val) => Array.isArray(val)
  return v
})()

/**
 * Factory: validador que acepta solo los valores del array.
 * @param {readonly any[]} allowed
 * @returns {Validator}
 */
export function isOneOf(allowed) {
  const set = new Set(allowed)
  return {
    name: `oneOf(${allowed.map(String).join('|')})`,
    check: (val) => set.has(val),
  }
}

/**
 * Factory: combinador. El valor debe pasar TODOS los validadores.
 * @param  {...Validator} validators
 * @returns {Validator}
 */
export function allOf(...validators) {
  return {
    name: validators.map(v => v.name).join('&'),
    check: (val) => validators.every(v => v.check(val)),
  }
}

/**
 * Marca un validador como opcional (acepta undefined/null ademas del tipo).
 * @param {Validator} validator
 * @returns {Validator}
 */
export function optional(validator) {
  return {
    name: `${validator.name}?`,
    check: (val) => val == null || validator.check(val),
  }
}

/**
 * Marca un validador como requerido (lanza si es undefined/null).
 * @param {Validator} validator
 * @returns {Validator}
 */
export function isRequired(validator) {
  return {
    name: `required(${validator.name})`,
    check: (val) => val != null && validator.check(val),
  }
}

/**
 * Ejecuta un diccionario de validadores contra un objeto de props.
 * NO lanza: recoge TODOS los fallos y los loggea via console.warn con
 * prefijo [propValidation]. Pensado para no romper UX.
 *
 * @param {object} instance  - Objeto a validar (props, payload, etc.)
 * @param {object} schema    - { propName: Validator }
 * @param {string} [label]   - Etiqueta para el log ("Chat", "HomeScreen props")
 * @returns {boolean} true si todo valido, false si hay fallos
 */
export function validateProps(instance, schema, label = 'unknown') {
  if (!instance || typeof instance !== 'object') {
    console.warn(`[propValidation] ${label}: instance is not an object`)
    return false
  }
  const failures = []
  for (const [key, validator] of Object.entries(schema)) {
    if (validator && !validator.check(instance[key])) {
      failures.push(`${key}: expected ${validator.name}, got ${typeof instance[key]} (${JSON.stringify(instance[key])?.slice(0, 60)})`)
    }
  }
  if (failures.length) {
    console.warn(`[propValidation] ${label}:`, failures.join('; '))
    return false
  }
  return true
}

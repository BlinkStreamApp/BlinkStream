

function make(typeName) {
  return { check: () => true, name: typeName }
}

export const isString = (() => {
  const v = make('string')
  v.check = (val) => typeof val === 'string'
  return v
})()

export const isNumber = (() => {
  const v = make('number')
  v.check = (val) => typeof val === 'number' && Number.isFinite(val)
  return v
})()

export const isBoolean = (() => {
  const v = make('boolean')
  v.check = (val) => typeof val === 'boolean'
  return v
})()

export const isArray = (() => {
  const v = make('array')
  v.check = (val) => Array.isArray(val)
  return v
})()

export function isOneOf(allowed) {
  const set = new Set(allowed)
  return {
    name: `oneOf(${allowed.map(String).join('|')})`,
    check: (val) => set.has(val),
  }
}

export function allOf(...validators) {
  return {
    name: validators.map(v => v.name).join('&'),
    check: (val) => validators.every(v => v.check(val)),
  }
}

export function optional(validator) {
  return {
    name: `${validator.name}?`,
    check: (val) => val == null || validator.check(val),
  }
}

export function isRequired(validator) {
  return {
    name: `required(${validator.name})`,
    check: (val) => val != null && validator.check(val),
  }
}

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

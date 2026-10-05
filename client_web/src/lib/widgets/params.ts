import type { WidgetParams, WidgetTypeParam } from "../types";

// Widget parameters: building a form from a declaration.
// A widget type arrives from the API with a list of parameters:
// [{ "name": "city", "type": "string" }, { "name": "days", "type": "integer" }]
// optionally enriched with a label, a default, a list of options, and what
// an empty value means ({ "emptyLabel": "Tous les états" }).

/*
 What the form holds while the user types.
 */
export type FieldValues = Record<string, string>;

/* One message per field in error, keyed by parameter name. */
export type FieldErrors = Record<string, string>;

/*
 A param is required unless the server says otherwise. The fallback mirrors
 the server rule, for a param received without `required`: optional only
 when it says what an empty value means.
 */
export function isParamRequired(param: WidgetTypeParam): boolean {
  return param.required ?? (param.emptyLabel === undefined && param.default === undefined);
}

/*
 Initial values for a parameter list: each param's default, or empty, so
 every field starts controlled and pre-filled with something sensible.
 */
export function createEmptyValues(params: WidgetTypeParam[]): FieldValues {
  const values: FieldValues = {};
  for (const param of params) {
    values[param.name] = param.default === undefined ? "" : String(param.default);
  }
  return values;
}

/*
 Pre-fills the form from an existing widget.
 */
export function toFieldValues(params: WidgetTypeParam[], widgetParams: WidgetParams): FieldValues {
  const values: FieldValues = {};
  for (const param of params) {
    const currentValue = widgetParams[param.name];
    values[param.name] = currentValue === undefined ? "" : String(currentValue);
  }
  return values;
}

/*
 Checks the form and returns one message per field in error. Same rules as
 the server, so the user hears about a mistake before submitting.
 */
export function validateFieldValues(
  params: WidgetTypeParam[],
  fieldValues: FieldValues
): FieldErrors {
  const errors: FieldErrors = {};

  for (const param of params) {
    const rawValue = (fieldValues[param.name] ?? "").trim();
    if (rawValue === "") {
      if (isParamRequired(param)) {
        errors[param.name] = "Ce champ est obligatoire.";
      }
      continue;
    }
    if (param.type === "integer") {
      const parsedValue = Number(rawValue);
      // Number("12abc") is NaN, Number("1.5") is not an integer: both are
      // caught here, the empty case having already been handled above.
      if (!Number.isInteger(parsedValue)) {
        errors[param.name] = "Entre un nombre entier.";
      } else if (param.min !== undefined && parsedValue < param.min) {
        errors[param.name] = `Minimum ${param.min}.`;
      } else if (param.max !== undefined && parsedValue > param.max) {
        errors[param.name] = `Maximum ${param.max}.`;
      }
    } else if (param.options && !param.options.some((option) => option.value === rawValue)) {
      errors[param.name] = "Choisis une valeur dans la liste.";
    }
  }
  return errors;
}

/* True when no field is in error. */
export function hasNoError(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}

/*
 Converts the form values into the shape the API expects. An empty optional
 field is sent as "" and the server applies its default or "no filter".
 */
export function toWidgetParams(params: WidgetTypeParam[], fieldValues: FieldValues): WidgetParams {
  const widgetParams: WidgetParams = {};

  for (const param of params) {
    const rawValue = (fieldValues[param.name] ?? "").trim();
    widgetParams[param.name] =
      param.type === "integer" && rawValue !== "" ? Number(rawValue) : rawValue;
  }
  return widgetParams;
}

/*
 The input type for a declared parameter type.
 */
export function inputTypeFor(paramType: WidgetTypeParam["type"]): "number" | "text" {
  return paramType === "integer" ? "number" : "text";
}

/*
 A readable label from a parameter name.
 */
export function labelFor(paramName: string): string {
  const spaced = paramName
    .replace(/[_-]+/g, " ")
    // camelCase -> camel Case
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/* The label of a param: the one the server gave, or one built from its name. */
export function paramLabel(param: WidgetTypeParam): string {
  return param.label ?? labelFor(param.name);
}

/*
 A value as the user should read it, in the summary or on the widget:
 the option label rather than its code ("Ouvertes" rather than "open"),
 and what an empty value means rather than nothing ("Tous les labels").
 Returns "" when an empty value has no stated meaning.
 */
export function displayValue(param: WidgetTypeParam, rawValue: string | number | undefined): string {
  const value = rawValue === undefined ? "" : String(rawValue).trim();
  if (value === "") {
    return param.emptyLabel ?? "";
  }
  const option = param.options?.find((candidate) => candidate.value === value);
  return option ? option.label : value;
}

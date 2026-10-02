import type { AboutParam, WidgetParams } from "../types";

// Widget parameters: building a form from a declaration.
// A widget type arrives from the API with a list of parameters:
// [{ "name": "city", "type": "string" }, { "name": "days", "type": "integer" }]

/*
 What the form holds while the user types.
 */
export type FieldValues = Record<string, string>;

/* One message per field in error, keyed by parameter name. */
export type FieldErrors = Record<string, string>;

/* Empty values for a parameter list, so every field starts controlled. */
export function createEmptyValues(params: AboutParam[]): FieldValues {
  const values: FieldValues = {};
  for (const param of params) {
    values[param.name] = "";
  }
  return values;
}

/*
 Pre-fills the form from an existing widget.
 */
export function toFieldValues(params: AboutParam[], widgetParams: WidgetParams): FieldValues {
  const values: FieldValues = {};
  for (const param of params) {
    const currentValue = widgetParams[param.name];
    values[param.name] = currentValue === undefined ? "" : String(currentValue);
  }
  return values;
}

/*
 Checks the form and returns one message per field in error.
 */
export function validateFieldValues(
  params: AboutParam[],
  fieldValues: FieldValues
): FieldErrors {
  const errors: FieldErrors = {};

  for (const param of params) {
    const rawValue = (fieldValues[param.name] ?? "").trim();
    if (rawValue === "") {
      errors[param.name] = "Ce champ est obligatoire.";
      continue;
    }
    if (param.type === "integer") {
      const parsedValue = Number(rawValue);
      // Number("") is 0 and Number("12abc") is NaN: both are caught here,
      // the empty case having already been handled above.
      if (!Number.isInteger(parsedValue)) {
        errors[param.name] = "Entre un nombre entier.";
      }
    }
  }
  return errors;
}

/* True when no field is in error. */
export function hasNoError(errors: FieldErrors): boolean {
  return Object.keys(errors).length === 0;
}

/*
 Converts the form values into the shape the API expects.
 */
export function toWidgetParams(params: AboutParam[], fieldValues: FieldValues): WidgetParams {
  const widgetParams: WidgetParams = {};

  for (const param of params) {
    const rawValue = fieldValues[param.name] ?? "";
    widgetParams[param.name] =
      param.type === "integer" && rawValue !== "" ? Number(rawValue) : rawValue;
  }
  return widgetParams;
}

/*
 The input type for a declared parameter type.
 */
export function inputTypeFor(paramType: AboutParam["type"]): "number" | "text" {
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

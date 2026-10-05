"use client";

import { Input } from "@/components/ui";
import type { WidgetTypeParam } from "@/lib/types";
import {
  FieldErrors,
  FieldValues,
  inputTypeFor,
  isParamRequired,
  paramLabel,
} from "@/lib/widgets/params";

// Kept for the files that still import it from here
export { toWidgetParams } from "@/lib/widgets/params";

interface WidgetParamsFormProps {
  params: WidgetTypeParam[];
  values: FieldValues;
  errors?: FieldErrors;
  disabled?: boolean;
  onChange: (name: string, rawValue: string) => void;
  /* Makes ids unique when two forms are on screen, and remounts the fields
     when the widget type changes, so a leftover value from the previous type
     never leaks into a field that shares a name but means something else */
  idPrefix?: string;
}

export function WidgetParamsForm({
  params,
  values,
  errors = {},
  disabled = false,
  onChange,
  idPrefix = "",
}: WidgetParamsFormProps) {
  if (params.length === 0) {
    return <p className="text-sm text-slate-400">Ce widget n&apos;a rien à configurer.</p>;
  }

  return (
    <>
      {params.map((param) => {
        const required = isParamRequired(param);
        // "(facultatif)" rather than an asterisk on required fields: the user
        // sees at a glance which fields can be skipped.
        const label = required ? paramLabel(param) : `${paramLabel(param)} (facultatif)`;
        const hint = hintFor(param, required);
        const fieldId = `${idPrefix}-${param.name}`;
        const value = values[param.name] ?? "";

        return (
          <div key={fieldId} className="flex flex-col gap-1">
            {param.options ? (
              <SelectField
                id={fieldId}
                label={label}
                param={param}
                required={required}
                value={value}
                error={errors[param.name]}
                disabled={disabled}
                onChange={(nextValue) => onChange(param.name, nextValue)}
              />
            ) : (
              <Input
                label={label}
                type={inputTypeFor(param.type)}
                inputMode={param.type === "integer" ? "numeric" : undefined}
                min={param.min}
                max={param.max}
                step={param.type === "integer" ? 1 : undefined}
                placeholder={param.placeholder}
                value={value}
                onChange={(event) => onChange(param.name, event.target.value)}
                error={errors[param.name]}
                disabled={disabled}
                required={required}
              />
            )}
            {hint && <p className="text-xs text-slate-500">{hint}</p>}
          </div>
        );
      })}
    </>
  );
}

/* The line under a field: its own help, then what leaving it empty does. */
function hintFor(param: WidgetTypeParam, required: boolean): string {
  const parts: string[] = [];
  if (param.help) {
    parts.push(param.help);
  }
  // A select already shows its emptyLabel as the first choice
  if (!required && !param.options && param.emptyLabel) {
    parts.push(`Laisser vide : ${param.emptyLabel.charAt(0).toLowerCase()}${param.emptyLabel.slice(1)}.`);
  }
  if (param.type === "integer" && param.min !== undefined && param.max !== undefined) {
    parts.push(`Entre ${param.min} et ${param.max}.`);
  }
  return parts.join(" ");
}

function SelectField({
  id,
  label,
  param,
  required,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  param: WidgetTypeParam;
  required: boolean;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm text-slate-300">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full rounded-md border bg-ink px-3 py-2 text-sm text-white
                    focus:border-signal focus:outline-none disabled:opacity-50
                    ${error ? "border-flare" : "border-line"}`}
      >
        {required ? (
          // Required with nothing chosen yet: a visible prompt that cannot be
          // submitted, rather than silently picking the first option
          value === "" && (
            <option value="" disabled>
              Choisir…
            </option>
          )
        ) : (
          // Optional: the empty choice comes first and says what it means
          <option value="">{param.emptyLabel ?? "Aucun filtre"}</option>
        )}
        {param.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} role="alert" className="text-xs text-flare">
          {error}
        </p>
      )}
    </div>
  );
}

"use client";

import { Input } from "@/components/ui";
import type { AboutParam } from "@/lib/types";
import {
  FieldErrors,
  FieldValues,
  inputTypeFor,
  labelFor,
} from "@/lib/widgets/params";

// The configuration form of a widget, generated from its declaration.

interface WidgetParamsFormProps {
  /* The parameters declared by the widget type, from GET /widget-types. */
  params: AboutParam[];
  values: FieldValues;
  errors?: FieldErrors;
  onChange: (paramName: string, value: string) => void;
  /* Disables every field while a request is in flight. */
  disabled?: boolean;
  /*
   Prefix for the input identifiers.
   */
  idPrefix?: string;
}

export function WidgetParamsForm({
  params,
  values,
  errors = {},
  onChange,
  disabled = false,
  idPrefix = "param",
}: WidgetParamsFormProps) {
  // A widget with no parameter is invalid per the assignment (C8). Saying so
  // is more useful than rendering an empty block.
  if (params.length === 0) {
    return (
      <p className="text-sm text-amber">
        Ce widget ne déclare aucun paramètre configurable.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {params.map((param) => (
        <Input
          // The key includes the prefix: switching widget type replaces the
          // fields instead of reusing them, so a value typed for the previous
          // type never lingers in an input.
          key={`${idPrefix}-${param.name}`}
          id={`${idPrefix}-${param.name}`}
          label={labelFor(param.name)}
          type={inputTypeFor(param.type)}
          // On a phone, this brings up the numeric keypad rather than the
          // full keyboard.
          inputMode={param.type === "integer" ? "numeric" : undefined}
          // step="1" tells the browser to refuse decimals on its own.
          step={param.type === "integer" ? 1 : undefined}
          value={values[param.name] ?? ""}
          onChange={(event) => onChange(param.name, event.target.value)}
          error={errors[param.name]}
          disabled={disabled}
          required
          // The machine name stays visible: the user configuring a widget
          // sees the same wording as the API documentation.
          placeholder={param.name}
        />
      ))}
    </div>
  );
}

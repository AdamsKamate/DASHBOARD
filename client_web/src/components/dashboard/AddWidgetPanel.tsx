"use client";

import { FormEvent, useMemo, useState } from "react";
import { Button, Card, FormError, Input } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import type { Position, Service, WidgetInstance, WidgetParams, WidgetType } from "@/lib/types";

// Add a widget to the dashboard.

const DEFAULT_REFRESH_RATE_SECONDS = 300;
const MIN_REFRESH_RATE_SECONDS = 30;

interface AddWidgetPanelProps {
  widgetTypes: WidgetType[];
  services: Service[];
  position: Position;
  onCreated: (widget: WidgetInstance) => void;
  onCancel: () => void;
}

/* The raw text of each field, converted to the declared types on submit. */
type FieldValues = Record<string, string>;

function toWidgetParams(widgetType: WidgetType, fieldValues: FieldValues): WidgetParams {
  const params: WidgetParams = {};
  for (const param of widgetType.params) {
    const rawValue = fieldValues[param.name] ?? "";
    // An empty integer field stays "": the server then answers "is required",
    // which is clearer than silently sending 0.
    params[param.name] =
      param.type === "integer" && rawValue !== "" ? Number(rawValue) : rawValue;
  }
  return params;
}

export function AddWidgetPanel({
  widgetTypes,
  services,
  position,
  onCreated,
  onCancel,
}: AddWidgetPanelProps) {
  /*
   Only widgets whose service is available: weather and RSS for everyone,
   GitHub or Google once the account is linked. Offering the others would
   only lead to a 403 after filling the form.
   */
  const availableWidgetTypes = useMemo(() => {
    const subscribedServiceNames = new Set(
      services.filter((service) => service.subscribed).map((service) => service.name)
    );
    return widgetTypes.filter((widgetType) => subscribedServiceNames.has(widgetType.service));
  }, [widgetTypes, services]);

  const [selectedTypeId, setSelectedTypeId] = useState(availableWidgetTypes[0]?.id ?? "");
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [refreshRate, setRefreshRate] = useState(String(DEFAULT_REFRESH_RATE_SECONDS));
  const [formError, setFormError] = useState<{ message: string; details?: string[] } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = availableWidgetTypes.find((widgetType) => widgetType.id === selectedTypeId);

  function handleTypeChange(widgetTypeId: string) {
    setSelectedTypeId(widgetTypeId);
    // Each type has its own parameters: values typed for the previous one
    // would not make sense here.
    setFieldValues({});
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedType) return;

    setFormError(null);
    setIsSubmitting(true);

    try {
      const createdWidget = await api.widgets.create({
        widgetTypeId: selectedType.id,
        params: toWidgetParams(selectedType, fieldValues),
        refreshRate: Number(refreshRate),
        position,
      });
      onCreated(createdWidget);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        setFormError({ message: "La configuration contient une erreur :", details: error.details });
      } else if (error instanceof ApiError && error.status === 403) {
        setFormError({ message: "Ce service n'est pas lié à ton compte." });
      } else {
        setFormError({ message: "Impossible d'ajouter le widget. Réessaie dans un instant." });
      }
      setIsSubmitting(false);
    }
  }

  if (availableWidgetTypes.length === 0) {
    return (
      <Card title="Ajouter un widget">
        <p className="text-sm text-slate-400">Aucun service disponible pour le moment.</p>
        <Button variant="secondary" className="mt-4" onClick={onCancel}>
          Fermer
        </Button>
      </Card>
    );
  }

  return (
    <Card title="Ajouter un widget">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
        <div className="flex flex-col gap-1">
          <label htmlFor="widget-type" className="text-sm text-slate-400">
            Type de widget
          </label>
          <select
            id="widget-type"
            value={selectedTypeId}
            onChange={(event) => handleTypeChange(event.target.value)}
            className="h-10 px-3 rounded-md bg-surface border border-line text-white
                       focus:border-signal outline-none"
          >
            {availableWidgetTypes.map((widgetType) => (
              <option key={widgetType.id} value={widgetType.id}>
                {widgetType.service} · {widgetType.name}
              </option>
            ))}
          </select>
          {selectedType && <p className="text-xs text-slate-500">{selectedType.description}</p>}
        </div>

        {selectedType?.params.map((param) => (
          <Input
            key={`${selectedType.id}-${param.name}`}
            label={param.name}
            type={param.type === "integer" ? "number" : "text"}
            inputMode={param.type === "integer" ? "numeric" : undefined}
            value={fieldValues[param.name] ?? ""}
            onChange={(event) =>
              setFieldValues((previous) => ({ ...previous, [param.name]: event.target.value }))
            }
            required
          />
        ))}

        <Input
          label={`Rafraîchissement (secondes, minimum ${MIN_REFRESH_RATE_SECONDS})`}
          type="number"
          inputMode="numeric"
          min={MIN_REFRESH_RATE_SECONDS}
          value={refreshRate}
          onChange={(event) => setRefreshRate(event.target.value)}
          required
        />

        {formError && <FormError message={formError.message} details={formError.details} />}

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Ajout..." : "Ajouter"}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Annuler
          </Button>
        </div>
      </form>
    </Card>
  );
}

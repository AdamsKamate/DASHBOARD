"use client";

import { useMemo, useState } from "react";
import { Button, FormError, Input } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { WidgetParamsForm } from "@/components/widgets/WidgetParamsForm";
import { api, ApiError } from "@/lib/api";
import {
  FieldErrors,
  FieldValues,
  createEmptyValues,
  displayValue,
  hasNoError,
  isParamRequired,
  paramLabel,
  toWidgetParams,
  validateFieldValues,
} from "@/lib/widgets/params";
import {
  DEFAULT_REFRESH_RATE_SECONDS,
  MIN_REFRESH_RATE_SECONDS,
  REFRESH_PRESETS,
  describeRefreshRate,
  validateRefreshRate,
} from "@/lib/widgets/refresh";
import type { Position, Service, WidgetInstance, WidgetType } from "@/lib/types";

// Creating a widget instance (C9), in three steps.

type Step = "type" | "config" | "refresh";

const STEP_LABELS: Record<Step, string> = {
  type: "Type de widget",
  config: "Configuration",
  refresh: "Rafraîchissement",
};

const STEP_ORDER: Step[] = ["type", "config", "refresh"];

interface AddWidgetModalProps {
  widgetTypes: WidgetType[];
  services: Service[];
  position: Position;
  onCreated: (widget: WidgetInstance) => void;
  onCancel: () => void;
}

export function AddWidgetModal({
  widgetTypes,
  services,
  position,
  onCreated,
  onCancel,
}: AddWidgetModalProps) {
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

  const [step, setStep] = useState<Step>("type");
  const [selectedTypeId, setSelectedTypeId] = useState("");
  const [fieldValues, setFieldValues] = useState<FieldValues>({});
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [refreshRate, setRefreshRate] = useState(String(DEFAULT_REFRESH_RATE_SECONDS));
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<{ message: string; details?: string[] } | null>(
    null
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const selectedType = availableWidgetTypes.find((widgetType) => widgetType.id === selectedTypeId);

  function chooseType(widgetTypeId: string) {
    const nextType = availableWidgetTypes.find((widgetType) => widgetType.id === widgetTypeId);
    setSelectedTypeId(widgetTypeId);
    // Each type has its own parameters: values typed for the previous one
    // would not make sense here.
    setFieldValues(nextType ? createEmptyValues(nextType.params) : {});
    setFieldErrors({});
    setSubmitError(null);
    setStep("config");
  }

  function goToRefreshStep() {
    if (!selectedType) return;

    // Validated on leaving the step, not on every keystroke: an error shown
    // while the user is still typing their first letter is noise.
    const validationErrors = validateFieldValues(selectedType.params, fieldValues);
    setFieldErrors(validationErrors);
    if (hasNoError(validationErrors)) {
      setStep("refresh");
    }
  }

  async function handleConfirm() {
    if (!selectedType) return;

    const refreshValidationError = validateRefreshRate(refreshRate);
    setRefreshError(refreshValidationError);
    if (refreshValidationError) {
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const createdWidget = await api.widgets.create({
        widgetTypeId: selectedType.id,
        params: toWidgetParams(selectedType.params, fieldValues),
        refreshRate: Number(refreshRate),
        position,
      });
      onCreated(createdWidget);
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        // The server validates too, and knows things the front end does not:
        // that a city exists, that a repository is reachable.
        setSubmitError({
          message: "La configuration contient une erreur :",
          details: error.details,
        });
        setStep("config");
      } else if (error instanceof ApiError && error.status === 403) {
        setSubmitError({ message: "Ce service n'est pas lié à ton compte." });
      } else {
        setSubmitError({ message: "Impossible d'ajouter le widget. Réessaie dans un instant." });
      }
      setIsSubmitting(false);
    }
  }

  if (availableWidgetTypes.length === 0) {
    return (
      <Modal title="Ajouter un widget" onClose={onCancel}>
        <p className="text-sm text-slate-400">
          Aucun service disponible pour le moment. Lie un compte depuis la page Services.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      title="Ajouter un widget"
      onClose={onCancel}
      footer={<StepFooter
        step={step}
        isSubmitting={isSubmitting}
        canContinue={Boolean(selectedType)}
        onBack={() => setStep(STEP_ORDER[STEP_ORDER.indexOf(step) - 1] ?? "type")}
        onNext={goToRefreshStep}
        onConfirm={handleConfirm}
        onCancel={onCancel}
      />}
    >
      <StepIndicator currentStep={step} />

      {submitError && (
        <div className="mb-4">
          <FormError message={submitError.message} details={submitError.details} />
        </div>
      )}

      {step === "type" && (
        <TypeStep widgetTypes={availableWidgetTypes} onChoose={chooseType} />
      )}

      {step === "config" && selectedType && (
        <ConfigStep
          widgetType={selectedType}
          values={fieldValues}
          errors={fieldErrors}
          disabled={isSubmitting}
          onChange={(paramName, value) =>
            setFieldValues((previous) => ({ ...previous, [paramName]: value }))
          }
        />
      )}

      {step === "refresh" && selectedType && (
        <RefreshStep
          widgetType={selectedType}
          values={fieldValues}
          refreshRate={refreshRate}
          error={refreshError}
          disabled={isSubmitting}
          onChange={(value) => {
            setRefreshRate(value);
            setRefreshError(null);
          }}
        />
      )}
    </Modal>
  );
}

/** Where the user is in the flow, and what is left. */
function StepIndicator({ currentStep }: { currentStep: Step }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <ol className="mb-4 flex items-center gap-2 text-xs">
      {STEP_ORDER.map((step, index) => {
        const isDone = index < currentIndex;
        const isCurrent = index === currentIndex;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={
                isCurrent
                  ? "rounded-full bg-signal/15 border border-signal/40 px-2 py-0.5 text-signal"
                  : isDone
                    ? "rounded-full border border-pulse/40 px-2 py-0.5 text-pulse"
                    : "rounded-full border border-line px-2 py-0.5 text-slate-500"
              }
              // The current step is announced, so a screen reader user knows
              // where they are without counting.
              aria-current={isCurrent ? "step" : undefined}
            >
              {index + 1}. {STEP_LABELS[step]}
            </span>
            {index < STEP_ORDER.length - 1 && <span className="text-slate-600">→</span>}
          </li>
        );
      })}
    </ol>
  );
}

function TypeStep({
  widgetTypes,
  onChoose,
}: {
  widgetTypes: WidgetType[];
  onChoose: (widgetTypeId: string) => void;
}) {
  // Grouped by service: on a dashboard with four services and eight widgets,
  // a flat list makes the user read every entry to find the right one.
  const byService = useMemo(() => {
    const groups = new Map<string, WidgetType[]>();
    for (const widgetType of widgetTypes) {
      const group = groups.get(widgetType.service) ?? [];
      group.push(widgetType);
      groups.set(widgetType.service, group);
    }
    return [...groups.entries()];
  }, [widgetTypes]);

  return (
    <div className="flex flex-col gap-4">
      {byService.map(([serviceName, types]) => (
        <section key={serviceName}>
          <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">{serviceName}</h3>
          <div className="flex flex-col gap-2">
            {types.map((widgetType) => (
              <button
                key={widgetType.id}
                type="button"
                onClick={() => onChoose(widgetType.id)}
                className="rounded-md border border-line bg-ink p-3 text-left
                           hover:border-signal focus-visible:border-signal"
              >
                <p className="text-sm font-medium text-white">{widgetType.name}</p>
                <p className="text-xs text-slate-400">{widgetType.description}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {describeParamCount(widgetType)}
                </p>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

/*
 "1 champ obligatoire, 4 facultatifs": tells the user how much they really
 have to fill in before they open the form.
 */
function describeParamCount(widgetType: WidgetType): string {
  const requiredCount = widgetType.params.filter(isParamRequired).length;
  const optionalCount = widgetType.params.length - requiredCount;

  if (widgetType.params.length === 0) {
    return "Rien à configurer";
  }
  const parts: string[] = [];
  if (requiredCount > 0) {
    parts.push(`${requiredCount} champ${requiredCount > 1 ? "s" : ""} obligatoire${requiredCount > 1 ? "s" : ""}`);
  }
  if (optionalCount > 0) {
    parts.push(`${optionalCount} facultatif${optionalCount > 1 ? "s" : ""}`);
  }
  return parts.join(", ");
}

function ConfigStep({
  widgetType,
  values,
  errors,
  disabled,
  onChange,
}: {
  widgetType: WidgetType;
  values: FieldValues;
  errors: FieldErrors;
  disabled: boolean;
  onChange: (paramName: string, value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-slate-400">{widgetType.description}</p>
      <WidgetParamsForm
        idPrefix={`add-${widgetType.id}`}
        params={widgetType.params}
        values={values}
        errors={errors}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

function RefreshStep({
  widgetType,
  values,
  refreshRate,
  error,
  disabled,
  onChange,
}: {
  widgetType: WidgetType;
  values: FieldValues;
  refreshRate: string;
  error: string | null;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="mb-2 text-sm text-slate-400">Intervalle de rafraîchissement</p>
        <div className="flex flex-wrap gap-2">
          {REFRESH_PRESETS.map((preset) => (
            <button
              key={preset.seconds}
              type="button"
              onClick={() => onChange(String(preset.seconds))}
              disabled={disabled}
              className={
                Number(refreshRate) === preset.seconds
                  ? "rounded-md border border-signal bg-signal/15 px-3 py-1 text-sm text-signal"
                  : "rounded-md border border-line px-3 py-1 text-sm text-slate-400 hover:border-signal"
              }
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <Input
        label={`Ou une valeur précise, en secondes (minimum ${MIN_REFRESH_RATE_SECONDS})`}
        type="number"
        inputMode="numeric"
        min={MIN_REFRESH_RATE_SECONDS}
        step={1}
        value={refreshRate}
        onChange={(event) => onChange(event.target.value)}
        error={error ?? undefined}
        disabled={disabled}
      />

      {!error && (
        <p className="text-xs text-slate-500">
          Ce widget se mettra à jour {describeRefreshRate(Number(refreshRate))}.
        </p>
      )}

      {/* A summary before confirming: the user reviews what they configured
          two steps ago without going back. */}
      <section className="rounded-md border border-line bg-ink p-3">
        <h3 className="mb-2 text-xs uppercase tracking-wide text-slate-500">Récapitulatif</h3>
        <dl className="flex flex-col gap-1 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-slate-500">Widget</dt>
            <dd className="text-white">{widgetType.name}</dd>
          </div>
          {/* The option label rather than its code ("Ouvertes", not "open"),
              and what an empty field means ("Tous les labels"), so the user
              sees the filter they set, not a blank. */}
          {widgetType.params.map((param) => {
            const shownValue = displayValue(param, values[param.name]);
            if (shownValue === "") {
              return null;
            }
            return (
              <div key={param.name} className="flex justify-between gap-3">
                <dt className="text-slate-500">{paramLabel(param)}</dt>
                <dd className="truncate text-white">{shownValue}</dd>
              </div>
            );
          })}
        </dl>
      </section>
    </div>
  );
}

function StepFooter({
  step,
  isSubmitting,
  canContinue,
  onBack,
  onNext,
  onConfirm,
  onCancel,
}: {
  step: Step;
  isSubmitting: boolean;
  canContinue: boolean;
  onBack: () => void;
  onNext: () => void;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      {step === "type" ? (
        <Button variant="secondary" onClick={onCancel}>
          Annuler
        </Button>
      ) : (
        <Button variant="secondary" onClick={onBack} disabled={isSubmitting}>
          Retour
        </Button>
      )}

      {step === "config" && (
        <Button onClick={onNext} disabled={!canContinue}>
          Continuer
        </Button>
      )}

      {step === "refresh" && (
        <Button onClick={onConfirm} disabled={isSubmitting}>
          {isSubmitting ? "Ajout..." : "Ajouter le widget"}
        </Button>
      )}
    </>
  );
}

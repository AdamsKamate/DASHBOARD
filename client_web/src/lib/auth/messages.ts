import { ApiError } from "../api";

// Error messages shown to the user.

export interface DisplayableError {
  message: string;
  details?: string[];
}

const NETWORK_ERROR: DisplayableError = {
  message: "Impossible de joindre le serveur. Réessaie dans un instant.",
};

export function loginErrorMessage(error: unknown): DisplayableError {
  if (!(error instanceof ApiError)) {
    return NETWORK_ERROR;
  }
  switch (error.status) {
    case 400:
      return { message: "Renseigne ton email et ton mot de passe." };
    case 401:
      // Same message for an unknown email and a wrong password: telling them
      // apart would let anyone find out which addresses are registered.
      return { message: "Email ou mot de passe incorrect." };
    case 403:
      return {
        message: "Confirme ton compte avec le lien reçu par email avant de te connecter.",
      };
    default:
      return NETWORK_ERROR;
  }
}

export function registerErrorMessage(error: unknown): DisplayableError {
  if (!(error instanceof ApiError)) {
    return NETWORK_ERROR;
  }
  switch (error.status) {
    case 400:
      // `details` lists the exact problems: invalid email, password too
      // short. Showing them avoids the useless "invalid form" message.
      return { message: "Le formulaire contient une erreur :", details: error.details };
    case 409:
      return { message: "Un compte existe déjà avec cet email." };
    default:
      return NETWORK_ERROR;
  }
}

export function verifyErrorMessage(error: unknown): DisplayableError {
  if (!(error instanceof ApiError)) {
    return NETWORK_ERROR;
  }
  if (error.status === 400) {
    return {
      message: "Ce lien de confirmation est invalide ou a déjà été utilisé.",
    };
  }
  return NETWORK_ERROR;
}

// Interface translations.

export const FRENCH = {
  // Header and navigation
  dashboard: "Dashboard",
  services: "Services",
  administration: "Administration",
  settings: "Paramètres",
  logout: "Se déconnecter",
  backToDashboard: "Retour au dashboard",

  // Settings menu
  theme: "Thème",
  themeDark: "Sombre",
  themeLight: "Clair",
  themeSystem: "Système",
  language: "Langue",
  languageFrench: "Français",
  languageEnglish: "English",

  // Dashboard
  widgetCount: "widget",
  widgetCountPlural: "widgets",
  addWidget: "Ajouter un widget",
  noWidgetYet: "Aucun widget pour l'instant.",
  refreshNow: "Rafraîchir maintenant",
  removeWidget: "Supprimer le widget",
  everySeconds: "Toutes les",
  seconds: "s",

  // Widget states
  loading: "Chargement…",
  pendingData: "Données en attente du premier rafraîchissement.",
  retry: "Réessayer",
  lastKnownData: "Dernières données connues",
  manageMyServices: "Gérer mes services",

  // Services
  linkAccount: "Lier",
  unlinkAccount: "Délier",
  linkedToAccount: "Lié à ton compte",
  requiresAuthorization: "Nécessite une autorisation",
  availableWithoutAuth: "Disponible sans authentification",

  // Administration
  adminTitle: "Administration des comptes",
  adminSubtitle: "Gérer les utilisateurs de la plateforme",
  accountEmail: "Adresse",
  accountRole: "Rôle",
  accountStatus: "Statut",
  accountCreated: "Inscrit le",
  accountWidgets: "Widgets",
  accountServices: "Services liés",
  accountActions: "Actions",
  roleAdmin: "Administrateur",
  roleUser: "Utilisateur",
  statusVerified: "Confirmé",
  statusUnverified: "Non confirmé",
  promote: "Promouvoir",
  demote: "Rétrograder",
  deleteAccount: "Supprimer",
  confirmDelete: "Supprimer définitivement ce compte, ses widgets et ses services liés ?",
  youBadge: "toi",
  totalAccounts: "compte",
  totalAccountsPlural: "comptes",
  noAccounts: "Aucun compte pour l'instant.",
  adminAccessDenied: "Cette section est réservée aux administrateurs.",

  // Shared
  cancel: "Annuler",
  confirm: "Confirmer",
  close: "Fermer",
  loadingError: "Le chargement a échoué.",
} as const;

/* Every key the interface uses. English must provide all of them */
export type Translations = Record<keyof typeof FRENCH, string>;

export const ENGLISH: Translations = {
  dashboard: "Dashboard",
  services: "Services",
  administration: "Administration",
  settings: "Settings",
  logout: "Sign out",
  backToDashboard: "Back to dashboard",

  theme: "Theme",
  themeDark: "Dark",
  themeLight: "Light",
  themeSystem: "System",
  language: "Language",
  languageFrench: "Français",
  languageEnglish: "English",

  widgetCount: "widget",
  widgetCountPlural: "widgets",
  addWidget: "Add a widget",
  noWidgetYet: "No widget yet.",
  refreshNow: "Refresh now",
  removeWidget: "Remove widget",
  everySeconds: "Every",
  seconds: "s",

  loading: "Loading…",
  pendingData: "Waiting for the first refresh.",
  retry: "Try again",
  lastKnownData: "Last known data",
  manageMyServices: "Manage my services",

  linkAccount: "Link",
  unlinkAccount: "Unlink",
  linkedToAccount: "Linked to your account",
  requiresAuthorization: "Requires authorization",
  availableWithoutAuth: "Available without authentication",

  adminTitle: "Account administration",
  adminSubtitle: "Manage the users of the platform",
  accountEmail: "Address",
  accountRole: "Role",
  accountStatus: "Status",
  accountCreated: "Registered on",
  accountWidgets: "Widgets",
  accountServices: "Linked services",
  accountActions: "Actions",
  roleAdmin: "Administrator",
  roleUser: "User",
  statusVerified: "Confirmed",
  statusUnverified: "Not confirmed",
  promote: "Promote",
  demote: "Demote",
  deleteAccount: "Delete",
  confirmDelete: "Permanently delete this account, its widgets and its linked services?",
  youBadge: "you",
  totalAccounts: "account",
  totalAccountsPlural: "accounts",
  noAccounts: "No account yet.",
  adminAccessDenied: "This section is reserved for administrators.",

  cancel: "Cancel",
  confirm: "Confirm",
  close: "Close",
  loadingError: "Loading failed.",
};

export type Language = "fr" | "en";

export const DICTIONARIES: Record<Language, Translations> = {
  fr: FRENCH,
  en: ENGLISH,
};

import nodemailer, { Transporter } from "nodemailer";

// Email delivery.

let transporter: Transporter | null = null;

/*
 Indicates whether an SMTP server is configured.
 */
export function isMailerConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST);
}

function getTransporter(): Transporter {
  if (transporter) return transporter;

  const port = Number(process.env.SMTP_PORT ?? 1025);

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // Implicit TLS is used only on port 465. On ports 587 and 1025,
    secure: port === 465,
    // MailHog does not require authentication: passing an empty `auth` object
    // would cause the connection to fail, so it is omitted completely.
    auth: process.env.SMTP_USER
      ? {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        }
      : undefined,
  });

  return transporter;
}

export interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/*
 Sends an email.
 */
export async function sendMail(options: MailOptions): Promise<boolean> {
  if (!isMailerConfigured()) {
    return false;
  }
  try {
    await getTransporter().sendMail({
      from: process.env.SMTP_FROM ?? "no-reply@dashboard.local",
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    });
    return true;
  } catch (err) {
    console.error("[mailer] delivery failed:", (err as Error).message);
    return false;
  }
}

/*
 Sends the registration confirmation email (C3).
 The message is provided as both plain text and HTML.
 */
export async function sendVerificationEmail(
  email: string,
  token: string
): Promise<boolean> {
  // The link points at the FRONT END, not at the API
  const clientUrl = process.env.CLIENT_URL ?? "http://localhost:8081";
  const link = `${clientUrl}/verify?token=${token}`;

  return sendMail({
    to: email,
    subject: "Confirm your Dashboard account",
    text: [
      "Welcome to Dashboard.",
      "",
      "Confirm your account by opening the link below:",
      link,
      "",
      "If you did not create this account, you can ignore this message.",
    ].join("\n"),
    html: `
      <div style="font-family: system-ui, sans-serif; max-width: 480px;">
        <h2 style="color: #0b1f4b;">Welcome to Dashboard</h2>
        <p>Confirm your account to start building your dashboard.</p>
        <p style="margin: 24px 0;">
          <a href="${link}"
             style="background: #1e5aff; color: #fff; padding: 12px 20px;
                    border-radius: 6px; text-decoration: none;">
            Confirm my account
          </a>
        </p>
        <p style="color: #5a6270; font-size: 13px;">
          If the button does not work, copy this link into your browser:<br>
          <a href="${link}">${link}</a>
        </p>
        <p style="color: #5a6270; font-size: 13px;">
          If you did not create this account, you can ignore this message.
        </p>
      </div>
    `,
  });
}

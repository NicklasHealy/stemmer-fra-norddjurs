"""
Email-notifikationer — Stemmer fra Norddjurs
============================================

Sender notifikationer via SMTP (Microsoft 365).
Konfigureres via .env — se .env.example.

Alle funktioner er "best effort": fejl logges men kaster ikke exceptions,
så email-fejl aldrig blokerer borgerens handling.
"""

import os
import smtplib
import threading
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

SMTP_HOST     = os.getenv("SMTP_HOST", "smtp.office365.com")
SMTP_PORT     = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER     = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SMTP_FROM     = os.getenv("SMTP_FROM", SMTP_USER)
ADMIN_EMAIL   = os.getenv("ADMIN_NOTIFY_EMAIL", "")

ENABLED = bool(SMTP_USER and SMTP_PASSWORD and ADMIN_EMAIL)


def _send(subject: str, html_body: str, to: str = None) -> None:
    """Intern afsendelse — køres i baggrundstråd så det ikke blokerer requesten."""
    recipient = to or ADMIN_EMAIL
    if not ENABLED or not recipient:
        print(f"[Email] Notifikation ikke sendt (SMTP ikke konfigureret): {subject}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = SMTP_FROM
    msg["To"]      = recipient
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)
        print(f"[Email] Sendt: {subject} → {recipient}")
    except Exception as e:
        print(f"[Email] Fejl ved afsendelse af '{subject}': {e}")


def _async_send(subject: str, html_body: str, to: str = None) -> None:
    """Sender emailen i en baggrundstråd — blokerer ikke requestet."""
    t = threading.Thread(target=_send, args=(subject, html_body, to), daemon=True)
    t.start()


# ─── Notifikationstyper ──────────────────────────────────────────────────────

def notify_citizen_question(forloeb_title: str, question_body: str,
                             citizen_email: str, is_anonymous: bool,
                             admin_url: str = "") -> None:
    """Ny borgerspørgsmål afventer godkendelse."""
    fra = "Anonym borger" if is_anonymous else citizen_email
    tidspunkt = datetime.now().strftime("%d.%m.%Y kl. %H:%M")
    admin_link = f'<p><a href="{admin_url}" style="color:#006564">Gå til admin-panelet →</a></p>' if admin_url else ""

    html = f"""
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1D3E47;">
      <div style="background: #006564; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 18px;">💬 Nyt borgerspørgsmål afventer godkendelse</h2>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Forløb: <strong>{forloeb_title}</strong></p>
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Fra: <strong>{fra}</strong></p>
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #666;">Tidspunkt: {tidspunkt}</p>
        <div style="background: #fff; border-left: 4px solid #006564; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 15px; line-height: 1.6;">"{question_body}"</p>
        </div>
        <p style="font-size: 14px; color: #444; margin-bottom: 16px;">
          Log ind i admin-panelet for at godkende eller afvise spørgsmålet.
        </p>
        {admin_link}
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #999; margin: 0;">Stemmer fra Norddjurs — automatisk notifikation</p>
      </div>
    </div>
    """
    _async_send(f"[Stemmer fra Norddjurs] Nyt borgerspørgsmål: {forloeb_title}", html)


def notify_flagged_response(question_title: str, response_text: str,
                             citizen_email: str, admin_url: str = "") -> None:
    """En besvarelse er blevet flagget af indholdsmoderingen."""
    tidspunkt = datetime.now().strftime("%d.%m.%Y kl. %H:%M")
    admin_link = f'<p><a href="{admin_url}" style="color:#006564">Gå til admin-panelet →</a></p>' if admin_url else ""
    preview = response_text[:300] + ("…" if len(response_text) > 300 else "")

    html = f"""
    <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1D3E47;">
      <div style="background: #992B30; padding: 20px 24px; border-radius: 12px 12px 0 0;">
        <h2 style="color: #fff; margin: 0; font-size: 18px;">🚩 Besvarelse flagget til gennemgang</h2>
      </div>
      <div style="background: #f9f9f9; padding: 24px; border: 1px solid #e0e0e0; border-top: none; border-radius: 0 0 12px 12px;">
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Spørgsmål: <strong>{question_title}</strong></p>
        <p style="margin: 0 0 8px 0; font-size: 14px; color: #666;">Borger: <strong>{citizen_email}</strong></p>
        <p style="margin: 0 0 16px 0; font-size: 14px; color: #666;">Tidspunkt: {tidspunkt}</p>
        <div style="background: #fff; border-left: 4px solid #992B30; padding: 14px 18px; border-radius: 0 8px 8px 0; margin-bottom: 20px;">
          <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #333;">"{preview}"</p>
        </div>
        <p style="font-size: 14px; color: #444; margin-bottom: 16px;">
          Indholdsmoderingen har markeret denne besvarelse. Log ind og godkend eller udgå den.
        </p>
        {admin_link}
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="font-size: 12px; color: #999; margin: 0;">Stemmer fra Norddjurs — automatisk notifikation</p>
      </div>
    </div>
    """
    _async_send(f"[Stemmer fra Norddjurs] Flagget besvarelse: {question_title}", html)

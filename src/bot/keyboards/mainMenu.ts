import { Markup } from "telegraf";
import type { ProggaaRole } from "../../types/domain";
import { ICON, TERMS } from "../messages/brand";

/**
 * Callback data conventions (all ASCII, under Telegram's 64 byte limit):
 *   menu:<screen>        open a hero screen        teacher:<screen>   mentor screens
 *   admin:<screen>       admin screens             payment:<verb>:...  confirmed actions
 * Handlers re-check the person's role from the website on every tap, so these
 * strings are only routing, never permission.
 */

export function startKeyboard(linked: boolean, role?: ProggaaRole) {
  if (!linked) {
    return Markup.inlineKeyboard([
      [Markup.button.callback(`${ICON.link} Connect Proggaa`, "start:link")],
      [Markup.button.callback(`${ICON.help} Help`, "menu:help")],
    ]);
  }

  const rows = [
    [Markup.button.callback("🏠 Dashboard", "menu:dashboard")],
    [
      Markup.button.callback(`${ICON.mission} ${TERMS.courses}`, "menu:missions"),
      Markup.button.callback(`${ICON.encounter} ${TERMS.exams}`, "menu:exams"),
    ],
    [
      Markup.button.callback(`${ICON.live} Live classes`, "menu:live"),
      Markup.button.callback(`${ICON.result} Results`, "menu:results"),
    ],
    [
      Markup.button.callback("🔎 Browse & buy", "menu:browse"),
      Markup.button.callback("🛍️ Store", "menu:store"),
    ],
    [
      Markup.button.callback(`${ICON.coins} ${TERMS.coins}`, "menu:wallet"),
      Markup.button.callback("➕ More", "menu:more"),
    ],
    [
      Markup.button.callback(`${ICON.bell} Notifications`, "menu:notifications"),
      Markup.button.callback(`${ICON.settings} Settings`, "menu:settings"),
    ],
  ];
  if (role === "TEACHER" || role === "ADMIN") rows.push([Markup.button.callback(`${ICON.mentor} ${TERMS.teacher} tools`, "menu:teacher")]);
  if (role === "ADMIN") rows.push([Markup.button.callback(`${ICON.admin} Admin tools`, "menu:admin")]);
  rows.push([Markup.button.callback(`${ICON.help} Help`, "menu:help"), Markup.button.callback("🆘 Support", "menu:support")]);
  return Markup.inlineKeyboard(rows);
}

/** The second page of the menu: everything else a hero can open. */
export function moreKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("🗓️ Calendar", "menu:calendar"), Markup.button.callback(`${ICON.achievement} Leaderboard`, "menu:leaderboard")],
    [Markup.button.callback(`${ICON.medal} Medals`, "menu:medals"), Markup.button.callback("📢 Announcements", "menu:announcements")],
    [Markup.button.callback(`${ICON.achievement} Achievements`, "menu:achievements"), Markup.button.callback("📈 Progress", "menu:progress")],
    [Markup.button.callback("🗓️ What's next", "menu:studyplan"), Markup.button.callback(`${ICON.payment} Payments`, "menu:payments")],
    [Markup.button.callback("⬅️ Menu", "menu:home")],
  ]);
}

export function studentDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`${ICON.mission} ${TERMS.courses}`, "menu:missions"),
      Markup.button.callback(`${ICON.encounter} ${TERMS.exams}`, "menu:exams"),
    ],
    [
      Markup.button.callback(`${ICON.live} Live classes`, "menu:live"),
      Markup.button.callback(`${ICON.coins} ${TERMS.coins}`, "menu:wallet"),
    ],
    [
      Markup.button.callback("📈 Progress", "menu:progress"),
      Markup.button.callback("🗓️ What's next", "menu:studyplan"),
    ],
    [Markup.button.callback("⬅️ Menu", "menu:home")],
  ]);
}

export function teacherDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback(`${ICON.mission} ${TERMS.courses}`, "teacher:missions"),
      Markup.button.callback(`${ICON.encounter} ${TERMS.exams}`, "teacher:exams"),
    ],
    [
      Markup.button.callback(`${ICON.live} Live ${TERMS.exams}`, "teacher:live"),
      Markup.button.callback("📝 Grading", "teacher:grading"),
    ],
    [Markup.button.callback("📊 Analytics", "teacher:analytics")],
    [Markup.button.callback("📢 Announce", "tool:announce"), Markup.button.callback("➕ Grant access", "tool:grant")],
    [Markup.button.callback(`${ICON.medal} Issue a Medal`, "tool:medal")],
    [Markup.button.callback("⬅️ Menu", "menu:home")],
  ]);
}

export function adminDashboardKeyboard(hasGroups: boolean) {
  const rows = [
    [
      Markup.button.callback(`${ICON.payment} Payments`, "admin:payments"),
      Markup.button.callback(`${TERMS.student}s & users`, "admin:users"),
    ],
    [Markup.button.callback("📊 Statistics", "admin:stats")],
  ];
  if (hasGroups) {
    rows.push([
      Markup.button.callback("📢 Group announce", "admin:groupannounce"),
      Markup.button.callback("⚙️ Group settings", "admin:groupsettings"),
    ]);
    rows.push([Markup.button.callback("🚨 Group moderation", "admin:moderation")]);
  }
  rows.push([Markup.button.callback("⬅️ Menu", "menu:home")]);
  return Markup.inlineKeyboard(rows);
}

export function confirmKeyboard(confirmData: string, cancelData: string, confirmLabel = "✅ Confirm") {
  return Markup.inlineKeyboard([
    [Markup.button.callback(confirmLabel, confirmData), Markup.button.callback("↩️ Cancel", cancelData)],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ Menu", "menu:home")]]);
}

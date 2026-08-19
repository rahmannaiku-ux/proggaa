import { Markup } from "telegraf";

export function startKeyboard(linked: boolean) {
  const rows = [
    [Markup.button.callback(linked ? "🔗 Account Connected ✅" : "🔗 Connect Proggaa", "start:link")],
    [
      Markup.button.callback("📚 My Courses", "menu:courses"),
      Markup.button.callback("📝 Exams", "menu:exams"),
    ],
    [
      Markup.button.callback("📊 Results", "menu:results"),
      Markup.button.callback("🏆 Achievements", "menu:achievements"),
    ],
    [
      Markup.button.callback("🔔 Notifications", "menu:notifications"),
      Markup.button.callback("⚙️ Settings", "menu:settings"),
    ],
    [Markup.button.callback("❓ Help", "menu:help")],
  ];
  return Markup.inlineKeyboard(rows);
}

export function studentDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📚 Courses", "menu:courses"),
      Markup.button.callback("📝 Exams", "menu:exams"),
    ],
    [
      Markup.button.callback("📊 Results", "menu:results"),
      Markup.button.callback("🏆 My Progress", "menu:progress"),
    ],
    [
      Markup.button.callback("🧠 Study Assistant", "menu:study"),
      Markup.button.callback("📅 Study Plan", "menu:studyplan"),
    ],
    [Markup.button.callback("🚨 Exam Help", "menu:examhelp")],
    [
      Markup.button.callback("🔔 Notifications", "menu:notifications"),
      Markup.button.callback("🆘 Support", "support:menu"),
    ],
    [
      Markup.button.callback("💳 Payments", "menu:payments"),
      Markup.button.callback("⚙️ Settings", "menu:settings"),
    ],
  ]);
}

export function teacherDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("📚 Courses", "teacher:courses"),
      Markup.button.callback("📝 Exams", "teacher:exams"),
    ],
    [
      Markup.button.callback("🔴 Live Exams", "teacher:live"),
      Markup.button.callback("📝 Grading", "teacher:grading"),
    ],
    [
      Markup.button.callback("📊 Analytics", "teacher:analytics"),
      Markup.button.callback("📢 Announcements", "teacher:announcements"),
    ],
    [Markup.button.callback("🎫 Student Tickets", "teacher:tickets")],
  ]);
}

export function adminDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("💰 Payments", "admin:payments"),
      Markup.button.callback("👥 Users", "admin:users"),
    ],
    [
      Markup.button.callback("📚 Courses", "admin:courses"),
      Markup.button.callback("📝 Exams", "admin:exams"),
    ],
    [
      Markup.button.callback("📊 Statistics", "admin:stats"),
      Markup.button.callback("🚨 Alerts", "admin:alerts"),
    ],
    [
      Markup.button.callback("🎫 Support Center", "admin:support"),
    ],
    [
      Markup.button.callback("📢 Group Announce", "admin:groupannounce"),
      Markup.button.callback("🚨 Group Moderation", "admin:moderation"),
    ],
    [Markup.button.callback("⚙️ Group Settings", "admin:groupsettings")],
  ]);
}

export function paymentApprovalKeyboard(paymentId: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Approve", `payment:approve:ask:${paymentId}`),
      Markup.button.callback("❌ Reject", `payment:reject:ask:${paymentId}`),
    ],
  ]);
}

export function confirmKeyboard(confirmData: string, cancelData: string) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback("✅ Confirm", confirmData),
      Markup.button.callback("↩️ Cancel", cancelData),
    ],
  ]);
}

export function backToMenuKeyboard() {
  return Markup.inlineKeyboard([[Markup.button.callback("⬅️ Back to Menu", "menu:home")]]);
}

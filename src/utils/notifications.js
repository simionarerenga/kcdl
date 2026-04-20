// src/utils/notifications.js
// Notifications for KCDL Inspector — fires at 7am then every 2h until 6pm.
// Uses @capacitor/local-notifications for native device notification bar delivery.

const SCHEDULE_HOURS = [7, 9, 11, 13, 15, 17]; // 07:00 → 17:00
const ID_RECENTLY_WEIGHED_BASE = 1000;
const ID_UNSTACKED_BASE        = 1100;
const ID_DELIVERY_BASE         = 1200;
const CHANNEL_ID               = 'kcdl_reminders';

async function getPlugin() {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');
    return LocalNotifications;
  } catch { return null; }
}

// ── Create Android notification channel (must be done before scheduling) ──
async function ensureChannel(plugin) {
  try {
    await plugin.createChannel({
      id:          CHANNEL_ID,
      name:        'KCDL Reminders',
      description: 'Warehouse and copra task reminders',
      importance:  4,      // IMPORTANCE_HIGH — shows heads-up notification
      sound:       'default',
      vibration:   true,
      lights:      true,
    });
  } catch { /* channel already exists or not supported — ignore */ }
}

// ── Permission ────────────────────────────────────────────────────────────
export async function requestNotificationPermission() {
  const plugin = await getPlugin();
  if (!plugin) return false;
  try {
    const { display } = await plugin.requestPermissions();
    if (display === 'granted') await ensureChannel(plugin);
    return display === 'granted';
  } catch { return false; }
}

// ── Cancel notifications in an ID range ───────────────────────────────────
async function cancelRange(plugin, baseId, count = 20) {
  try {
    const { notifications } = await plugin.getPending();
    const toCancel = notifications
      .filter(n => n.id >= baseId && n.id < baseId + count)
      .map(n => ({ id: n.id }));
    if (toCancel.length) await plugin.cancel({ notifications: toCancel });
  } catch { /* ignore */ }
}

// ── Build a notification object ───────────────────────────────────────────
function makeNotif(id, title, body, fireAt) {
  return {
    id,
    title,
    body,
    channelId: CHANNEL_ID,
    schedule:  { at: fireAt, allowWhileIdle: true },
    sound:     'default',
    smallIcon: 'ic_stat_icon_config_sample',
    iconColor: '#007c91',
    // autoCancel: false means it stays in the notification bar until dismissed
    extra:     { persistent: true },
  };
}

// ── Schedule warehouse reminders ──────────────────────────────────────────
// Call whenever task counts change. Cancels old ones and schedules fresh ones
// for every remaining time slot today. This is what ensures re-appearance
// after the user dismisses — the next slot fires regardless.
export async function scheduleWarehouseReminders({ recentlyWeighedCount, unstakedKg }) {
  const plugin = await getPlugin();
  if (!plugin) return;

  await ensureChannel(plugin);
  await cancelRange(plugin, ID_RECENTLY_WEIGHED_BASE);
  await cancelRange(plugin, ID_UNSTACKED_BASE);

  // If both tasks are done, no need to schedule anything
  if (recentlyWeighedCount === 0 && unstakedKg <= 0.01) return;

  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const notifications = [];

  SCHEDULE_HOURS.forEach((hour, i) => {
    const fireAt = new Date(base);
    fireAt.setHours(hour, 0, 0, 0);
    // Fire immediately if we're within the same minute, else skip past slots
    if (fireAt < now && (now - fireAt) > 60000) return;

    if (recentlyWeighedCount > 0) {
      notifications.push(makeNotif(
        ID_RECENTLY_WEIGHED_BASE + i,
        '📦 Bags Awaiting Warehouse',
        `${recentlyWeighedCount} bag${recentlyWeighedCount !== 1 ? 's' : ''} in Recently Weighed — move them to the Warehouse.`,
        fireAt <= now ? new Date(Date.now() + 1000) : fireAt
      ));
    }

    if (unstakedKg > 0.01) {
      notifications.push(makeNotif(
        ID_UNSTACKED_BASE + i,
        '🏚️ Unstacked Copra Remaining',
        `${unstakedKg.toFixed(1)} kg of unstacked copra is still unbagged in the Warehouse.`,
        fireAt <= now ? new Date(Date.now() + 2000) : fireAt
      ));
    }
  });

  if (notifications.length) {
    try { await plugin.schedule({ notifications }); } catch { /* ignore */ }
  }
}

// ── Cancel all warehouse reminders (call when tasks are completed) ────────
export async function cancelWarehouseReminders() {
  const plugin = await getPlugin();
  if (!plugin) return;
  await cancelRange(plugin, ID_RECENTLY_WEIGHED_BASE);
  await cancelRange(plugin, ID_UNSTACKED_BASE);
}

// ── Immediate bag delivery notification from HQ ───────────────────────────
export async function notifyBagDelivery({ count, stationName }) {
  const plugin = await getPlugin();
  if (!plugin) return;
  await ensureChannel(plugin);
  try {
    await plugin.schedule({
      notifications: [makeNotif(
        ID_DELIVERY_BASE + (Date.now() % 99),
        '📦 Bags Dispatched from Tarawa',
        `Tarawa Office has dispatched ${count} bag${count !== 1 ? 's' : ''} to ${stationName || 'your station'}. Tap to review.`,
        new Date(Date.now() + 500)
      )],
    });
  } catch { /* ignore */ }
}

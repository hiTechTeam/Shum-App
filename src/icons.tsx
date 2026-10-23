// Line icons of the browser mockups.
const svg = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export const IconContacts = () => (
  <svg {...svg}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.6 3.2-5.5 6.5-5.5s5.9 1.9 6.5 5.5" /><circle cx="17" cy="9" r="2.5" /><path d="M17 14.5c2.4.2 4 1.8 4.5 4.5" /></svg>
);
export const IconChats = () => (
  <svg {...svg}><path d="M4 5h16v11H9l-5 4z" /></svg>
);
export const IconPanel = () => (
  <svg {...svg}><rect x="3" y="4" width="18" height="16" rx="3" /><path d="M10 4v16" /></svg>
);
export const IconSearch = () => (
  <svg {...svg}><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
);
export const IconMore = () => (
  <svg {...svg} fill="currentColor" stroke="none"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
);
export const IconGlobe = () => (
  <svg {...svg} width={16} height={16}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" /></svg>
);
export const IconPin = () => (
  <svg {...svg} width={14} height={14}><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7" /></svg>
);
export const IconLock = () => (
  <svg {...svg} width={12} height={12} strokeWidth={2.4}><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);
export const IconSmile = () => (
  <svg {...svg} width={16} height={16}><circle cx="12" cy="12" r="9" /><path d="M8.5 14.5c1.8 2 5.2 2 7 0" /><path d="M9 9.5h.01M15 9.5h.01" strokeWidth={2.6} /></svg>
);
export const IconArrow = () => (
  <svg {...svg} strokeWidth={2.4}><path d="M12 19V5M6 11l6-6 6 6" /></svg>
);
export const IconTicks = (props: { read?: boolean }) => (
  <svg {...svg} width={16} height={12} viewBox="0 0 24 16" strokeWidth={2.2}>
    <path d="M2 8l4 4 8-9" />
    {props.read && <path d="M10 11l1 1 8-9" />}
  </svg>
);
export const IconClock = () => (
  <svg {...svg} width={12} height={12} strokeWidth={2.4}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);

/** The mark of an outgoing message, as on iPhone: a clock while it is on its
 * way (queued or waiting on a relay), one tick once the recipient's device has
 * it, two ticks once it is read. */
export const DeliveryMark = ({ status }: { status: string }) => {
  if (status === "read") return <span className="delivery" title="Прочитано"><IconTicks read /></span>;
  if (status === "delivered") return <span className="delivery" title="Доставлено"><IconTicks /></span>;
  if (status === "queued" || status === "forwarding") return <span className="delivery" title="Передаётся"><IconClock /></span>;
  return null;
};
export const IconPlus = () => (
  <svg {...svg} strokeWidth={2.2}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconKey = () => (
  <svg {...svg}><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3M14 9l2 2" /></svg>
);

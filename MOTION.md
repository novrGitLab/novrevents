# NovrEvents motion

The cover changes only when a visitor turns the deck. A short tilt brings the next photograph forward. Hovering or focusing on an occasion changes its adjacent preview. Keyboard focus and pointer hover move a directional arrow toward its destination. A raised ticket edge on event cards identifies the selectable item. Native scrolling preserves orientation across discovery and event details.

| Moment | Trigger | Movement | Accessible fallback |
| --- | --- | --- | --- |
| Ticket cover | Previous or next scene | Rotate two degrees and settle over 350ms | Instant change |
| Occasion preview | Hover or keyboard focus | Fade from 75% opacity over 320ms | Instant change |
| Event link | Hover or keyboard focus | Arrow advances 4px over 160ms | Persistent underline or focus ring |

CSS owns transitions. No timers, canvas, smooth-scroll controller or continuous animation are needed. Reduced-motion rules remove transforms and animations. All actions remain available on touch and in short viewports.

## Account entry and workspace

The paper ticket gives a single short wave when its poster is hovered. Reduced-motion users see the resting pose. Scrolling reveals a narrow cobalt thumb on the active surface for 850 ms after the last scroll event. High-contrast settings keep native scrollbar colors.

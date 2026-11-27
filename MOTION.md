# NovrEvents motion

The photograph settles into its frame as the headline appears. Keyboard focus and pointer hover move a directional arrow toward its destination. A raised ticket edge on event cards identifies the selectable item. Native scrolling preserves orientation across discovery and event details.

| Moment | Trigger | Movement | Accessible fallback |
| --- | --- | --- | --- |
| Opening photograph | First paint | Scale 1.025 to 1 over 850ms | Static image |
| Headline | First paint | Rise 9px over 420ms | Visible final position |
| Event link | Hover or keyboard focus | Arrow advances 4px over 160ms | Persistent underline or focus ring |

CSS owns transitions. No timers, canvas, smooth-scroll controller or continuous animation are needed. Reduced-motion rules remove transforms and animations. All actions remain available on touch and in short viewports.

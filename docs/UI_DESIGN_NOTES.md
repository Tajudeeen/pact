# Pact Access UI design notes

This branch adapts the supplied Weir landing-page reference into Pact's own product language.

## Visual direction

- Light neutral canvas, near-black text, restrained blue as the action and data accent.
- Large editorial hero type, short supporting copy, and a compact rounded navigation bar.
- Fine grid lines, technical monospace labels, and small data cards to make the product feel like infrastructure.
- A custom network diagram visualizes Pact's actual order: agent request, owner authorization, payment finality, resource delivery.

## Motion system

- The network paths animate with a slow dash offset to suggest movement through the gate.
- Nodes float by a few pixels, while the transaction card moves subtly to keep the hero alive without competing with the message.
- The data bars use staggered delays to create a restrained signal field.
- Content sections reveal on first entry into the viewport with a short fade and upward movement.
- Flow cards lift slightly on hover and their bottom rule expands.
- FAQ details use native disclosure behavior with a rotating chevron.

## Accessibility and performance

- The motion is CSS-first and uses no new animation dependency.
- Scroll reveals use IntersectionObserver and unobserve elements after revealing them.
- If IntersectionObserver is unavailable, content is made visible immediately.
- The page respects prefers-reduced-motion and disables smooth scrolling and nonessential animation.
- The network diagram is labeled as illustrative. It does not imply a live transaction or testnet connection.

## Responsive behavior

- The hero stacks below tablet width.
- The network diagram scales down and repositions its four nodes on mobile.
- The four-step flow becomes a single column.
- Developer code stays horizontally scrollable rather than clipping long lines.
- Navigation links collapse while the primary source/build link remains available.

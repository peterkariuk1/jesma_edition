---
name: "CSOK Jesma Edition"
description: "A dark editorial, teacher-controlled PDF examination viewing environment inspired by high-conversion editorial typography and warm amber accents."
---

## Overview

CSOK Jesma Edition is an ultra-focused, secure PDF examination viewer designed for club-organized academic evaluations. It rejects standard LMS and portal clutter in favor of an austere, distraction-free environment. 

The aesthetic translates the editorial finesse of dark modern design: deep obsidian/charcoal surfaces with warm brown undertones, glowing warm orange circular action anchors, pill-shaped translucent controls, crisp sans-serif structure, and high-elegance serif italic accent headings. The experience conveys seriousness, academic integrity, and calm focus under examination conditions.

## Colors

The palette grounds the interface in deep charcoal `#0B0A09` with warm espresso tones, illuminated by vibrant accent orange `#F07845` pills and precise status indicators. Every surface-foreground pair maintains WCAG AA compliance.

- **Primary Background:** Deep near-black with warm brown undertone (`#0B0A09`).
- **Surface Elevation:** Secondary dark tone (`#151312`) and card containers (`#191716`) with fine hairline borders (`#2A2624`).
- **Accent Orange:** High-energy focal indicator (`#F07845`) used for the signature circular icon anchors, active badges, and key moments.
- **Status Semantics:** Warning amber (`#F4B84A`), error red (`#E45D54`), and connection green (`#83B99A`).

```yaml
colors:
  accent: "#F07845"
  warning: "#F4B84A"
  error: "#E45D54"
  success: "#83B99A"
  outline: "#2A2624"
  outline-variant: "#383330"
  paper-bg: "#FAF8F5"
  paper-text: "#1E1C1A"
  paper-border: "#D5CDC5"
  paper-muted: "#524B43"
  paper-box: "#F2EDE8"
  warm-badge: "#2A1E18"
  editorial-cream: "#E8DCCB"
  light:
    primary: "#0B0A09"
    on-primary: "#F5F2EE"
    surface: "#151312"
    on-surface: "#F5F2EE"
    surface-container: "#191716"
    on-surface-variant: "#A7A09A"
  dark:
    primary: "#F07845"
    on-primary: "#0B0A09"
    surface: "#0B0A09"
    on-surface: "#F5F2EE"
    surface-container: "#191716"
    on-surface-variant: "#A7A09A"
```

## Typography

The typography couples **Instrument Sans** for clean, legible body text and structural elements with **Playfair Display** (incorporating its distinguished italic cuts) for editorial headlines, and **Source Code Pro** for timestamps and telemetry codes.

```yaml
typography:
  display-lg:
    fontFamily: "Playfair Display"
    fontSize: 56px
    fontWeight: 600
    lineHeight: 64px
    letterSpacing: -1px
  display-lg-mobile:
    fontFamily: "Playfair Display"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -0.5px
  headline-xl:
    fontFamily: "Playfair Display"
    fontSize: 40px
    fontWeight: 600
    lineHeight: 48px
    letterSpacing: -0.5px
  headline-xl-mobile:
    fontFamily: "Playfair Display"
    fontSize: 28px
    fontWeight: 600
    lineHeight: 36px
    letterSpacing: -0.25px
  headline-lg:
    fontFamily: "Instrument Sans"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 40px
    letterSpacing: -0.5px
  headline-lg-mobile:
    fontFamily: "Instrument Sans"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.25px
  headline-md:
    fontFamily: "Instrument Sans"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: 0px
  title-lg:
    fontFamily: "Instrument Sans"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 28px
    letterSpacing: 0px
  title-md:
    fontFamily: "Instrument Sans"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 24px
    letterSpacing: 0px
  body-lg:
    fontFamily: "Instrument Sans"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 28px
    letterSpacing: 0.15px
  body-md:
    fontFamily: "Instrument Sans"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 22px
    letterSpacing: 0.25px
  body-sm:
    fontFamily: "Instrument Sans"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 18px
    letterSpacing: 0.25px
  label-lg:
    fontFamily: "Instrument Sans"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 20px
    letterSpacing: 0.5px
  label-sm:
    fontFamily: "Instrument Sans"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0.5px
  code-sm:
    fontFamily: "Source Code Pro"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
```

## Layout & Spacing

A centralized, disciplined grid hierarchy keeps views focused and uncluttered. Content containers are strictly proportioned to avoid horizontal sprawl. Spacing is built on an 8px modular baseline.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 48px
  page-margin: 24px
```

## Elevation & Depth

Depth is established via subtle dark surface-tier transitions (`#0B0A09` base, `#151312` panels, `#191716` cards) outlined with razor-thin `1px` borders (`#2A2624` or `#383330`). Atmospheric warm radial ambient glows sit behind primary hero headers. Heavy drop shadows are avoided.

## Shapes

Shapes emulate the reference site's distinct pill-shaped action containers and softly rounded card surfaces.

```yaml
rounded:
  sm: 6px
  DEFAULT: 12px
  md: 16px
  lg: 24px
  xl: 32px
  full: 9999px
```

## Motion & Micro-interaction

Motion is calibrated, calm, and deliberate. Button hover transitions shift the orange circular chevron pill slightly to the right. Waiting room pulses emit smooth concentric rings without jarring flashing. Warning dialogs slide gently into focus.

```yaml
motion:
  state-change:
    duration: 150ms
    delay: 0ms
    timingFunction: cubic-bezier(0.4, 0, 0.2, 1)
  surface-enter:
    duration: 250ms
    delay: 0ms
    timingFunction: cubic-bezier(0.16, 1, 0.3, 1)
  surface-exit:
    duration: 150ms
    delay: 0ms
    timingFunction: cubic-bezier(0.4, 0, 1, 1)
```

## Voice & Content Strategy

The voice is formal, authoritative, reassuring, and uncompromisingly clear.
- Headers employ sentence case with deliberate italic emphasis on key themes.
- Security warnings explain the exact condition and remedy clearly.

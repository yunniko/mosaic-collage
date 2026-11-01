# Torn paper edges and paper relief: domain reference for G-001 M5

Date: 2026-11-01. Source: the global `domain-expert` agent (domains: paper physics and papermaking; the look
and lighting of paper collage pieces). Its sources were retrieved on 2026-11-01. Some PDFs could be read only
as abstracts. Each point says whether it is **established** (sourced), **inference** (reasoned from sourced
facts) or **judgement** (a plausible choice with no source).

## 1. How a tear forms

- **Mechanism (established).** Paper is a bonded fibre network. A tear advances through a fracture process
  zone about 3 mm across, which is linked to floc size. Inside that zone fibres either break or pull out
  whole; faster tears break more of them.
  - Kettunen & Niskanen, BioResources: <https://bioresources.cnr.ncsu.edu/?p=30074>
  - damage width: <https://bioresources.cnr.ncsu.edu/wp-content/uploads/2020/03/2001.2.1467.pdf>
  - Georgia Tech: <https://hg.gatech.edu/node/640949>
- **Edge geometry (established).** A torn line is self-affine. Its Hurst exponent H is about 0.6–0.8, with
  models predicting about 2/3. Some studies find it multiscaling, and it depends on direction in newsprint.
  - <https://arxiv.org/abs/cond-mat/0509120>
  - <https://arxiv.org/pdf/cond-mat/0510368>
- **Length scales (inference).** The wander has three layers:
  - sub-mm fibre fuzz;
  - mm-scale wander at floc and process-zone size;
  - cm-scale drift from the hand and the grain.
- **Grain (established).** A tear along the grain runs fairly straight. A tear across it zigzags and wanders.
  Handmade sheets are close to isotropic.
  - <https://blog.midstatelitho.com/paper-grain/>
  - ASTM D528
- **Fibre length (established for wood pulp).** Hardwood about 1 mm; softwood kraft about 3 mm
  (<https://ippta.co/wp-content/uploads/2020/12/Dr.-S.P.Singh-PAPRI.pdf>). Kozo is about 3× longer than
  European papermaking fibres (<https://www.cxdinternational.com/paper-materials/japanese-paper/japanese-handmade-paper-pajapk0093>).
- **Protrusion (inference).** A fibre crossing the crack sticks out about L/4 on average and at most L/2.
  For the paper types used below, that gives:
  - copy paper: 0.1–0.5 mm;
  - newsprint: 0.1–0.4 mm;
  - cotton or watercolour paper: 0.3–1.5 mm;
  - kozo tissue: 1–7 mm.

## 2. The light band along a tear

- **Bevel (established).** A tear leaves a bevelled edge that thins to almost nothing. One side of the tear
  shows the paper's core and the other does not; which side depends on the direction of the pull.
  - NEDCC, Repairing Paper Artifacts
  - Indiana University flat-mending manual
- **Why the band is lighter (established).** Separated fibres scatter more light than bonded ones (Batchelor,
  TAPPI J 2005). The bevel also exposes the unprinted base under ink or coating.
- **Inference.** Even mass-dyed paper shows a paler, less saturated band in its own hue, not pure white.
- **Width (inference / judgement).** About thickness / tan(bevel angle): 0.3–2 mm on thin paper, up to about
  3 mm on thick paper.
- **Look (inference).**
  - The inner boundary is irregular, not a parallel offset of the edge.
  - The band is opaque on the inside and grows translucent toward the outer lip.
  - Fibre wisps extend beyond it.

## 3. What reads as "torn" rather than "jagged" (judgement)

- Self-affine wander with no single dominant frequency.
- Rounded local features, never visible polyline vertices.
- A translucent fringe and wisps outside the opaque edge.
- The light band.
- A faint contact shadow.

## 4. Relief

- **Optics (approximation).** Uncoated paper is close to Lambertian. A height field gives normals, and the
  intensity is I = max(0, n·L). Shade relative to the flat value, so flat areas keep their texture colour.
- **Slope limit (inference).** Paper breaks at about 1.5–4 % strain, which limits a slope's height-to-width
  ratio to about 0.2–0.3.
- **Contact shadow (judgement).** A glued piece's shadow is offset 0.1–0.5 mm, blurred 0.5–2 mm, at 10–30 %
  opacity.

## 5. Recommendations taken into the design

- **Torn line (well grounded).** fBm with gain 2^(−H), using H ≈ 0.65 (gain ≈ 0.64). Octaves run from the
  `scale` down to the pixel or 0.05 mm, whichever is larger.
- **Torn line (judgement).** Add a slower drift at about 3–10× the scale.
- **Grain (judgement).** About half the roughness along the grain.
- **Fibres (judgement on counts).**
  - A fuzz fringe 0.1–1 mm wide.
  - Discrete wisps, 5–40 per cm, each uniform in length on [0, L/2], at alpha 0.3–0.7.
  - Fibre length L by paper type: copy 1 mm, newsprint 1 mm, cotton 3 mm, kozo 10 mm.
- **Band (judgement).** 0.3–2 mm, with its width varied along the edge (correlation length 3–10 mm, allowed to
  reach 0). Opacity runs from 1 down to about 0.4 outward. Its default colour comes from the texture,
  lightened and desaturated.

## Findings against the code before M5

| Finding | Verdict | Outcome |
| --- | --- | --- |
| `noise1D` uses 4 octaves at gain 0.5 (H = 1), which gives a smooth wavy cut | unfounded for tears | replaced (D011) |
| `TornEdge` has no paper type, grain or band variation | gap | paper type and grain added (D011) |
| `Relief.depth` is a unitless strength | stylisation | kept as a strength, mapped to a slope within the 0.3 limit (D011) |
| `rimColor` default is white | approximation | becomes "from the texture" unless set (D011) |

## Confidence and gaps

- **High confidence:** the Hurst range, grain behaviour, wood-pulp fibre lengths, the bevel and core-exposure
  mechanism, and the scattering result.
- **Unsourced:** protrusion lengths, band widths, kozo length in mm, emboss depths and shadow values. Checking
  them means tearing real copy paper, newsprint and kozo and measuring under a loupe.

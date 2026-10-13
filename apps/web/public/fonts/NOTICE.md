# Offline font notices

These font files are shipped with PDF Studio Local so preview and PDF export do
not depend on a network service. Only the regular face is registered. Variable
source files are used at their regular/default instance where noted; PDF export
was checked with PyMuPDF's public `Font` and `insert_font` APIs.

| Family | File | Upstream | License |
| --- | --- | --- | --- |
| Inter | `Inter-Regular.ttf` | `google/fonts/ofl/inter` | SIL OFL 1.1 |
| Roboto | `Roboto-Regular.ttf` | `google/fonts/ofl/roboto` | SIL OFL 1.1 |
| Open Sans | `OpenSans-Regular.ttf` | `google/fonts/ofl/opensans` | SIL OFL 1.1 |
| Lato | `Lato-Regular.ttf` | `google/fonts/ofl/lato` | SIL OFL 1.1 |
| Source Sans 3 | `SourceSans3-Regular.otf` | `adobe-fonts/source-sans` release branch | SIL OFL 1.1 |
| Noto Sans | `NotoSans-Regular.ttf` | `google/fonts/ofl/notosans` | SIL OFL 1.1 |
| Montserrat | `Montserrat-Regular.ttf` | `JulietaUla/Montserrat` | SIL OFL 1.1 |
| Poppins | `Poppins-Regular.ttf` | `google/fonts/ofl/poppins` | SIL OFL 1.1 |
| IBM Plex Sans | `IBMPlexSans-Regular.ttf` | `google/fonts/ofl/ibmplexsans` | SIL OFL 1.1 |
| Ubuntu | `Ubuntu-Regular.ttf` | `google/fonts/ufl/ubuntu` | Ubuntu Font Licence 1.0 |
| Noto Serif | `NotoSerif-Regular.ttf` | `google/fonts/ofl/notoserif` | SIL OFL 1.1 |
| Liberation Serif | `LiberationSerif-Regular.ttf` | `liberationfonts/liberation-fonts` 2.1.5 | SIL OFL 1.1; reserved name Liberation |
| DejaVu Serif | `DejaVuSerif.ttf` | `dejavu-fonts/dejavu-fonts` 2.37 | Bitstream Vera / DejaVu licence |
| Merriweather | `Merriweather-Regular.ttf` | `google/fonts` pre-variable regular release | SIL OFL 1.1 |
| Playfair Display | `PlayfairDisplay-Regular.ttf` | `google/fonts/ofl/playfairdisplay` | SIL OFL 1.1 |
| IBM Plex Serif | `IBMPlexSerif-Regular.ttf` | `google/fonts/ofl/ibmplexserif` | SIL OFL 1.1 |
| Liberation Mono | `LiberationMono-Regular.ttf` | `liberationfonts/liberation-fonts` 2.1.5 | SIL OFL 1.1; reserved name Liberation |
| DejaVu Sans Mono | `DejaVuSansMono.ttf` | `dejavu-fonts/dejavu-fonts` 2.37 | Bitstream Vera / DejaVu licence |
| Fira Mono | `FiraMono-Regular.ttf` | `google/fonts/ofl/firamono` | SIL OFL 1.1 |
| IBM Plex Mono | `IBMPlexMono-Regular.ttf` | `google/fonts/ofl/ibmplexmono` | SIL OFL 1.1 |

Full licence texts are stored beside this notice:

- `LICENSE-OFL-1.1.txt`
- `LICENSE-UBUNTU.txt`
- `LICENSE-LIBERATION.txt`
- `LICENSE-DEJAVU.txt`

Vite copies these static assets into the desktop web payload too. Font binaries
are fetched and parsed only when their registry entry is selected.

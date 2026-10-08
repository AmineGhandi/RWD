# Design reference

Source: https://www.figma.com/design/RnaFFG4YYeMQ8QTrpW3KjH/RWD

The app uses RWD’s cream host and phone surfaces, night-purple public display, purple controls, amber live buzzer/winner highlights, mint success and rose wrong-answer states. Fonts are bundled locally: DM Sans, Space Grotesk and Anton.

Reference frames: host board `7:109`, host question `7:110`, phone ready `7:125`, display question `7:117`. Components are translated into reusable React views with ordinary CSS; no Tailwind dependency. Layout adapts to smaller browser widths instead of reproducing Figma’s fixed coordinates.

Dynamic room codes, player names, scores, timers and QR codes come from the actual game. The QR code uses the current browser origin so a host can use a LAN address. Question/category editing, waiting room, locked/open/won/beaten buzzers, answer reveal and final standings are implemented. Board persistence is the next milestone.

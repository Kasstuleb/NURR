#!/usr/bin/env bash
# build.sh — Assembles separate JS/CSS source files into a self-contained index.html
# Run: ./build.sh     → writes dist/index.html (works everywhere, no server needed)

set -e
mkdir -p dist

CSS=$(cat css/nurr.css)
HELPERS=$(cat js/helpers.js)
PALETTE=$(cat js/palette.js)
GRADIENT=$(cat js/gradient.js)
GEOMETRIC=$(cat js/geometric.js)
NATURE=$(cat js/nature.js)
ABSTRACT=$(cat js/abstract.js)
APP=$(cat js/app.js)

cat > dist/index.html << HTMLEOF
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>NURR — Wallpaper Studio</title>
<link rel="stylesheet" href="https://use.typekit.net/uib5hvg.css" />
<style>
${CSS}
</style>
</head>
<body>
  <div id="root"></div>
  <script src="https://unpkg.com/react@18.3.1/umd/react.development.js"></script>
  <script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.development.js"></script>
  <script src="https://unpkg.com/@babel/standalone@7.29.0/babel.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <script>
${HELPERS}
  </script>
  <script type="text/babel">
${PALETTE}
  </script>
  <script type="text/babel">
${GRADIENT}
  </script>
  <script type="text/babel">
${GEOMETRIC}
  </script>
  <script type="text/babel">
${NATURE}
  </script>
  <script type="text/babel">
${ABSTRACT}
  </script>
  <script type="text/babel">
${APP}
  </script>
</body>
</html>
HTMLEOF

echo "✓ Built → dist/index.html"

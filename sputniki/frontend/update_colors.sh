#!/bin/bash

# App.tsx replacements
sed -i 's/slate/zinc/g' src/App.tsx
sed -i 's/#080B10/black/g' src/App.tsx
sed -i 's/#040609/black/g' src/App.tsx
sed -i 's/#0D1117/#09090b/g' src/App.tsx
sed -i 's/emerald/blue/g' src/App.tsx
sed -i 's/cyan/blue/g' src/App.tsx

# Globe.tsx replacements
sed -i 's/slate/zinc/g' src/components/Globe.tsx
sed -i 's/cyan/blue/g' src/components/Globe.tsx
sed -i 's/emerald/blue/g' src/components/Globe.tsx
sed -i 's/#22d3ee/#3b82f6/g' src/components/Globe.tsx
sed -i 's/#34d399/#3b82f6/g' src/components/Globe.tsx
sed -i 's/#06b6d4/#6366f1/g' src/components/Globe.tsx
sed -i 's/#818cf8/#a855f7/g' src/components/Globe.tsx
sed -i 's/#64748b/#71717a/g' src/components/Globe.tsx
sed -i 's/#94a3b8/#a1a1aa/g' src/components/Globe.tsx
sed -i 's/rgba(71,85,105,0.2)/rgba(63,63,70,0.5)/g' src/components/Globe.tsx
sed -i 's/rgba(34,211,238,0.8)/rgba(59,130,246,0.8)/g' src/components/Globe.tsx
sed -i 's/border-bottom: 8px solid #34d399/border-bottom: 8px solid #3b82f6/g' src/components/Globe.tsx
sed -i 's/box-shadow: 0 0 8px #34d399/box-shadow: 0 0 8px #3b82f6/g' src/components/Globe.tsx

# ui components
sed -i 's/slate/zinc/g' src/components/ui/card.tsx
sed -i 's/#0D1117/#09090b/g' src/components/ui/card.tsx
sed -i 's/slate/zinc/g' src/components/ui/button.tsx
sed -i 's/cyan/blue/g' src/components/ui/button.tsx


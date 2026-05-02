import type { Config } from 'tailwindcss'
const {nextui} = require("@nextui-org/react");


const config: Config = {
  content: [
    '**/*.tsx', '**/*.ts', '**/*.html',
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    "./node_modules/@nextui-org/theme/dist/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  darkMode: "class",
  plugins: [nextui({
    themes: {
      light: {
        colors: {
          primary: '#01B96B',
          danger: "#ff2424"
        }
      },
      dark: {
        colors: {
          primary: '#01B96B',
          danger: "#ff2424"
        }
      }
    }
  }),
    require('@tailwindcss/typography')
  ],
  corePlugins: {
  },
}
export default config

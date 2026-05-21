// gradient-curated-palettes.js — NURR extended palette/shuffle engine
// Built from site palettes, Abstract presets, uploaded swatch SVGs, gradient examples, and rated JSON data.
// Replaces narrow random shuffle with weighted palette intelligence.

(function(){
  'use strict';

  const FAMILIES = [
  {
    "id": "site-helpers-js",
    "label": "Site helpers.js",
    "palettes": [
      [
        "#08015F",
        "#FC6C3D",
        "#F4C4D7"
      ],
      [
        "#07015B",
        "#962956",
        "#EB754B"
      ],
      [
        "#641249",
        "#6CBA62",
        "#93F0BC"
      ],
      [
        "#07127D",
        "#B66382",
        "#F09972"
      ],
      [
        "#BB2748",
        "#E2A0B7",
        "#1E1827"
      ],
      [
        "#98F2F4",
        "#457921",
        "#1C2D07"
      ],
      [
        "#EFD7E0",
        "#74152D",
        "#2A0410"
      ],
      [
        "#EB4C74",
        "#EF9166",
        "#F4BE62"
      ],
      [
        "#FAEBC6",
        "#F2F4E3",
        "#EBFCFD"
      ],
      [
        "#98F2F4",
        "#5E8966",
        "#080804"
      ],
      [
        "#FFFFFF",
        "#986B93",
        "#090309"
      ],
      [
        "#3D8225",
        "#1E410F",
        "#0C1B04"
      ],
      [
        "#7C1B14",
        "#3E0B08",
        "#180202"
      ],
      [
        "#FFFFFF",
        "#9F20A4",
        "#39063C"
      ],
      [
        "#57108A",
        "#A32B99",
        "#E38BB8"
      ],
      [
        "#D33B8E",
        "#E07DBB",
        "#F2CAEA"
      ],
      [
        "#98F2F4",
        "#3C5564",
        "#3A7F23"
      ],
      [
        "#C3C8C8",
        "#79160D",
        "#D12F22"
      ],
      [
        "#1E1827",
        "#BF4D6B",
        "#DBDDD8"
      ],
      [
        "#B5A9F9",
        "#D7C6FB",
        "#F8E3FD"
      ],
      [
        "#000000",
        "#6B956D",
        "#D2E4D3"
      ],
      [
        "#08015F",
        "#98F2F4",
        "#FC6C3D"
      ],
      [
        "#F4C4D7",
        "#E07DBB",
        "#57108A"
      ],
      [
        "#FAEBC6",
        "#EB4C74",
        "#7C1B14"
      ],
      [
        "#1C2D07",
        "#457921",
        "#98F2F4"
      ],
      [
        "#08015F",
        "#E38BB8",
        "#FAEBC6"
      ],
      [
        "#0C1B04",
        "#3D8225",
        "#F4BE62"
      ],
      [
        "#180202",
        "#7C1B14",
        "#F09972"
      ],
      [
        "#39063C",
        "#9F20A4",
        "#E38BB8"
      ],
      [
        "#1E1827",
        "#BB2748",
        "#F4C4D7"
      ]
    ]
  },
  {
    "id": "site-palette-lab-mode-js",
    "label": "Site palette-lab-mode.js",
    "palettes": [
      [
        "#F4EDE0",
        "#D8C7BD",
        "#9EB7C2",
        "#E6A6A9"
      ],
      [
        "#F4EDE0",
        "#D8C7BD",
        "#E6A6A9",
        "#4B3C3E"
      ],
      [
        "#F4EDE0",
        "#9EB7C2",
        "#4B3C3E"
      ],
      [
        "#F02D78",
        "#2A0D2D",
        "#5A4A00",
        "#FF3A14"
      ],
      [
        "#F02D78",
        "#2A0D2D",
        "#BE352D",
        "#98F2F4"
      ],
      [
        "#F02D78",
        "#5A4A00",
        "#BE352D",
        "#98F2F4"
      ],
      [
        "#D9FF1F",
        "#0D7C47",
        "#F8F2DE",
        "#FF6A1A"
      ],
      [
        "#D9FF1F",
        "#0D7C47",
        "#FF6A1A",
        "#071B2E"
      ],
      [
        "#D9FF1F",
        "#F8F2DE",
        "#071B2E"
      ],
      [
        "#05040A",
        "#08015F",
        "#2637D9",
        "#FC6C3D"
      ],
      [
        "#05040A",
        "#08015F",
        "#FC6C3D",
        "#98F2F4"
      ],
      [
        "#05040A",
        "#2637D9",
        "#98F2F4"
      ],
      [
        "#1A0710",
        "#8A1424",
        "#FC3C18",
        "#F4A13B"
      ],
      [
        "#1A0710",
        "#8A1424",
        "#F4A13B",
        "#F4EDE0"
      ],
      [
        "#1A0710",
        "#FC3C18",
        "#F4EDE0"
      ],
      [
        "#07104C",
        "#154D7A",
        "#77D7EA",
        "#C9B7E8"
      ],
      [
        "#07104C",
        "#154D7A",
        "#C9B7E8",
        "#F2FDFF"
      ],
      [
        "#07104C",
        "#77D7EA",
        "#F2FDFF"
      ],
      [
        "#050505",
        "#F1EEE6",
        "#B8B4A8",
        "#D9DC1B"
      ],
      [
        "#050505",
        "#F1EEE6",
        "#D9DC1B",
        "#5A5A54"
      ],
      [
        "#050505",
        "#B8B4A8",
        "#5A5A54"
      ],
      [
        "#20140F",
        "#7B4B31",
        "#B66A3C",
        "#C5B69C"
      ],
      [
        "#20140F",
        "#7B4B31",
        "#C5B69C",
        "#53624B"
      ],
      [
        "#20140F",
        "#B66A3C",
        "#53624B"
      ],
      [
        "#180D10",
        "#4A1E24",
        "#7A5739",
        "#D8C7A1"
      ],
      [
        "#180D10",
        "#4A1E24",
        "#D8C7A1",
        "#24372B"
      ],
      [
        "#180D10",
        "#7A5739",
        "#24372B"
      ],
      [
        "#F7FAFB",
        "#DDF7FA",
        "#A7B8C8",
        "#08015F"
      ],
      [
        "#F7FAFB",
        "#DDF7FA",
        "#08015F",
        "#D9DC1B"
      ],
      [
        "#F7FAFB",
        "#A7B8C8",
        "#D9DC1B"
      ],
      [
        "#B9F4E0",
        "#C9B7E8",
        "#FFF07A",
        "#FF9A8B"
      ],
      [
        "#B9F4E0",
        "#C9B7E8",
        "#FF9A8B",
        "#8BB9FF"
      ],
      [
        "#B9F4E0",
        "#FFF07A",
        "#8BB9FF"
      ],
      [
        "#FFF2D6",
        "#EF233C",
        "#2B59C3",
        "#FFB703"
      ],
      [
        "#FFF2D6",
        "#EF233C",
        "#FFB703",
        "#008F5A"
      ],
      [
        "#FFF2D6",
        "#2B59C3",
        "#008F5A"
      ],
      [
        "#05040A",
        "#F02D78",
        "#FC6C3D",
        "#BE352D"
      ],
      [
        "#05040A",
        "#F02D78"
      ]
    ]
  },
  {
    "id": "site-abstract-js",
    "label": "Site abstract.js",
    "palettes": [
      [
        "#1A1A3E",
        "#3A1060",
        "#0E3A7A",
        "#601040"
      ],
      [
        "#EAF0F2",
        "#F04A2F",
        "#2637D9",
        "#2E2A4F"
      ],
      [
        "#EAF0F2",
        "#F04A2F",
        "#2E2A4F",
        "#F7FAFB"
      ],
      [
        "#EAF0F2",
        "#2637D9",
        "#F7FAFB"
      ],
      [
        "#07104C",
        "#FC6C3D",
        "#98F2F4",
        "#E38BB8"
      ],
      [
        "#07104C",
        "#FC6C3D",
        "#E38BB8",
        "#05040A"
      ],
      [
        "#07104C",
        "#98F2F4",
        "#05040A"
      ],
      [
        "#F4EDE0",
        "#BE1E2D",
        "#1E33B8",
        "#B9BCC9"
      ],
      [
        "#F4EDE0",
        "#BE1E2D",
        "#B9BCC9",
        "#11121E"
      ],
      [
        "#F4EDE0",
        "#1E33B8",
        "#11121E"
      ],
      [
        "#05040A",
        "#08015F",
        "#FC6C3D",
        "#F4BE62"
      ],
      [
        "#05040A",
        "#08015F",
        "#F4BE62",
        "#98F2F4"
      ],
      [
        "#05040A",
        "#FC6C3D",
        "#98F2F4"
      ],
      [
        "#0B0638",
        "#FF2D72",
        "#E38BB8",
        "#98F2F4"
      ],
      [
        "#0B0638",
        "#FF2D72",
        "#98F2F4",
        "#F2FDFF"
      ],
      [
        "#0B0638",
        "#E38BB8",
        "#F2FDFF"
      ],
      [
        "#05040A",
        "#102B36",
        "#77D7EA",
        "#C9B7E8"
      ],
      [
        "#05040A",
        "#102B36",
        "#C9B7E8",
        "#DDF7FA"
      ],
      [
        "#05040A",
        "#77D7EA",
        "#DDF7FA"
      ],
      [
        "#08015F",
        "#FC6C3D",
        "#D9DC1B",
        "#98F2F4"
      ],
      [
        "#08015F",
        "#FC6C3D",
        "#98F2F4",
        "#F4EDE0"
      ],
      [
        "#08015F",
        "#D9DC1B",
        "#F4EDE0"
      ],
      [
        "#F4EDE0",
        "#FC6C3D",
        "#08015F",
        "#98F2F4"
      ],
      [
        "#F4EDE0",
        "#FC6C3D",
        "#98F2F4",
        "#14142A"
      ],
      [
        "#F4EDE0",
        "#08015F",
        "#14142A"
      ],
      [
        "#1A1A3E",
        "#3A1060",
        "#601040",
        "#98F2F4"
      ],
      [
        "#1A1A3E",
        "#0E3A7A",
        "#98F2F4"
      ]
    ]
  },
  {
    "id": "curated",
    "label": "curated",
    "palettes": [
      [
        "#FD5DCF",
        "#A51261",
        "#F3F3F1",
        "#2E484A"
      ],
      [
        "#FCD12C",
        "#0381ED",
        "#FF0C32",
        "#FF9FF4"
      ],
      [
        "#D5D4CF",
        "#009642",
        "#CFFA33",
        "#FE7B01"
      ],
      [
        "#009642",
        "#F84622",
        "#FE7B01",
        "#E916FF"
      ],
      [
        "#EAEAEA",
        "#FD5DCF",
        "#CCC3BA",
        "#C0CCFC"
      ],
      [
        "#691D29",
        "#190A13",
        "#F53522",
        "#B91F31"
      ],
      [
        "#F3AE39",
        "#C0011A",
        "#FCF6B8",
        "#E75909"
      ],
      [
        "#55100D",
        "#D9D9D9",
        "#DD0200",
        "#F54703"
      ],
      [
        "#DD6312",
        "#7B7673",
        "#FAF6EA",
        "#B82816"
      ],
      [
        "#F73B2A",
        "#24050B",
        "#B71026",
        "#F7448D"
      ],
      [
        "#E3FF9A",
        "#C2C4B5",
        "#F6F1E7",
        "#9DF200"
      ],
      [
        "#D0CECA",
        "#D3ED18",
        "#FBC3E6",
        "#ABB5EB"
      ],
      [
        "#C7CC10",
        "#4B52EB",
        "#5E4D3C",
        "#D1ED40"
      ],
      [
        "#598FFD",
        "#C7CC10",
        "#5E4D3C",
        "#0C2CC3"
      ],
      [
        "#1E1F24",
        "#052C45",
        "#C7C7C5",
        "#FF1727"
      ],
      [
        "#4F1535",
        "#1E1F24",
        "#F84622",
        "#FF5CCF"
      ],
      [
        "#4F1535",
        "#12291F",
        "#D0FF01",
        "#FB1000"
      ],
      [
        "#221337",
        "#D0CECA",
        "#D3ED18",
        "#818166"
      ],
      [
        "#1E011F",
        "#190013",
        "#87B2FF",
        "#E12BA9"
      ],
      [
        "#081599",
        "#080317",
        "#8BCAFF",
        "#87B2FF"
      ],
      [
        "#C8C693",
        "#7C679F",
        "#3F2646",
        "#34369B"
      ],
      [
        "#1829FD",
        "#20094F",
        "#400E45",
        "#250DD5"
      ],
      [
        "#450580",
        "#A28CFB",
        "#16021F",
        "#806EFE"
      ],
      [
        "#FD5035",
        "#1D020E",
        "#FC87C2",
        "#2E484A"
      ],
      [
        "#0B5F3D",
        "#ED2705",
        "#E80542",
        "#CB300A"
      ],
      [
        "#BC352A",
        "#514306",
        "#260F27",
        "#FD2D78"
      ],
      [
        "#FB381D",
        "#9F89F1",
        "#053D7C",
        "#2E0008"
      ],
      [
        "#D60C1E",
        "#DB4630",
        "#F2BC49",
        "#A51261"
      ],
      [
        "#03639E",
        "#E79C71",
        "#FBC3E6",
        "#F2BC49"
      ],
      [
        "#EAEAEA",
        "#4E4B38",
        "#F04E31",
        "#CCC3BA"
      ],
      [
        "#050505",
        "#C6C0A0",
        "#F2BC49",
        "#D1ED40"
      ],
      [
        "#E0D8C3",
        "#DF2D21",
        "#1E1F24",
        "#F2BC49"
      ],
      [
        "#222021",
        "#598FFD",
        "#EBF698",
        "#FF7043"
      ],
      [
        "#2460A8",
        "#711E2A",
        "#BE690E",
        "#D9C004"
      ],
      [
        "#010101",
        "#60798B",
        "#B5B198",
        "#DCD9C8"
      ],
      [
        "#050505",
        "#C6C0A0",
        "#FAF6EA",
        "#8C8C8C"
      ]
    ]
  },
  {
    "id": "example-example",
    "label": "Example example",
    "palettes": [
      [
        "#C13730",
        "#DD3C0F",
        "#6A4208",
        "#A13F0B"
      ],
      [
        "#C13730",
        "#DD3C0F",
        "#F43A15",
        "#90400A"
      ],
      [
        "#C13730",
        "#6A4208",
        "#D33446",
        "#90400A"
      ],
      [
        "#A771B8",
        "#E4305A",
        "#BB3934",
        "#BB3832"
      ],
      [
        "#A771B8",
        "#E4305A",
        "#A47BCF",
        "#6A4208"
      ],
      [
        "#A771B8",
        "#BB3934",
        "#DD3C0F",
        "#6A4208"
      ],
      [
        "#006DE7",
        "#16377E",
        "#241439",
        "#469DC9"
      ],
      [
        "#006DE7",
        "#16377E",
        "#201F4F",
        "#187EDD"
      ],
      [
        "#006DE7",
        "#241439",
        "#1C80DC",
        "#187EDD"
      ],
      [
        "#61757F",
        "#0F2E60",
        "#B72516",
        "#8E83D1"
      ],
      [
        "#61757F",
        "#0F2E60",
        "#7E1610",
        "#747BA3"
      ],
      [
        "#61757F",
        "#B72516",
        "#570B0C",
        "#747BA3"
      ],
      [
        "#124F70",
        "#144D6E",
        "#E6C387",
        "#DFC7AE"
      ],
      [
        "#124F70",
        "#144D6E",
        "#2972A9",
        "#0F1129"
      ],
      [
        "#124F70",
        "#E6C387",
        "#144C6C",
        "#0F1129"
      ],
      [
        "#A8125D",
        "#AEB1DB",
        "#C9B8A7",
        "#D28D34"
      ],
      [
        "#A8125D",
        "#AEB1DB",
        "#E0BA71",
        "#D83816"
      ],
      [
        "#A8125D",
        "#C9B8A7",
        "#D6881F",
        "#D83816"
      ],
      [
        "#FFFBFD",
        "#95645C",
        "#4D6D72",
        "#344F52"
      ],
      [
        "#FFFBFD",
        "#95645C",
        "#446266",
        "#1E0712"
      ],
      [
        "#FFFBFD",
        "#4D6D72",
        "#5C6F71",
        "#1E0712"
      ]
    ]
  },
  {
    "id": "upload-chaos-vibrant-03",
    "label": "Upload Chaos vibrant 03",
    "palettes": [
      [
        "#FD5DCF",
        "#A51261",
        "#2E484A",
        "#ABB5EB"
      ],
      [
        "#FD5DCF",
        "#F3F3F1",
        "#ABB5EB"
      ],
      [
        "#FCD12C",
        "#0381ED",
        "#FF9FF4",
        "#AF78D1"
      ],
      [
        "#FCD12C",
        "#FF0C32",
        "#AF78D1"
      ],
      [
        "#EAEAEA",
        "#FD5DCF",
        "#C0CCFC",
        "#EBFF6C"
      ],
      [
        "#EAEAEA",
        "#CCC3BA",
        "#EBFF6C"
      ],
      [
        "#009642",
        "#F84622",
        "#E916FF",
        "#072FC0"
      ],
      [
        "#009642",
        "#FE7B01",
        "#072FC0"
      ],
      [
        "#D5D4CF",
        "#009642",
        "#FE7B01",
        "#F3F3F1"
      ],
      [
        "#D5D4CF",
        "#CFFA33",
        "#F3F3F1"
      ]
    ]
  },
  {
    "id": "upload-deep-burn",
    "label": "Upload Deep burn",
    "palettes": [
      [
        "#DD6312",
        "#7B7673",
        "#B82816",
        "#060807"
      ],
      [
        "#DD6312",
        "#FAF6EA",
        "#060807"
      ],
      [
        "#F73B2A",
        "#24050B",
        "#F7448D",
        "#240A0B"
      ],
      [
        "#F73B2A",
        "#B71026",
        "#240A0B"
      ],
      [
        "#F3AE39",
        "#C0011A",
        "#E75909",
        "#0A5598"
      ],
      [
        "#F3AE39",
        "#FCF6B8",
        "#0A5598"
      ],
      [
        "#55100D",
        "#D9D9D9",
        "#DD0200",
        "#1B0706"
      ],
      [
        "#55100D",
        "#D9D9D9",
        "#1B0706",
        "#F54703"
      ],
      [
        "#55100D",
        "#DD0200",
        "#F54703"
      ]
    ]
  },
  {
    "id": "upload-earthly-modern-04",
    "label": "Upload earthly modern 04 ",
    "palettes": [
      [
        "#2460A8",
        "#711E2A",
        "#BE690E",
        "#24231E"
      ],
      [
        "#2460A8",
        "#711E2A",
        "#24231E",
        "#D9C004"
      ],
      [
        "#2460A8",
        "#BE690E",
        "#D9C004"
      ],
      [
        "#EAEAEA",
        "#4E4B38",
        "#CCC3BA",
        "#1A1500"
      ],
      [
        "#EAEAEA",
        "#F04E31",
        "#1A1500"
      ],
      [
        "#E0D8C3",
        "#DF2D21",
        "#F2BC49",
        "#8BA5A4"
      ],
      [
        "#E0D8C3",
        "#1E1F24",
        "#8BA5A4"
      ],
      [
        "#050505",
        "#C6C0A0",
        "#D1ED40",
        "#8C8C8C"
      ],
      [
        "#050505",
        "#F2BC49",
        "#8C8C8C"
      ],
      [
        "#222021",
        "#598FFD",
        "#FF7043",
        "#AC9D58"
      ],
      [
        "#222021",
        "#EBF698",
        "#AC9D58"
      ]
    ]
  },
  {
    "id": "upload-eco-electric-01",
    "label": "Upload Eco Electric 01",
    "palettes": [
      [
        "#87A029",
        "#D3ED18",
        "#D2DDBF",
        "#EBFF6C"
      ],
      [
        "#87A029",
        "#D3ED18",
        "#8C4C1C",
        "#A9A0F9"
      ],
      [
        "#87A029",
        "#D2DDBF",
        "#8C4C1C",
        "#A9A0F9"
      ],
      [
        "#598FFD",
        "#C7CC10",
        "#0C2CC3",
        "#8987EC"
      ],
      [
        "#598FFD",
        "#5E4D3C",
        "#8987EC"
      ],
      [
        "#C7CC10",
        "#4B52EB",
        "#D1ED40",
        "#0C2CC3"
      ],
      [
        "#C7CC10",
        "#5E4D3C",
        "#0C2CC3"
      ],
      [
        "#E3FF9A",
        "#C7CC10",
        "#D3ED18",
        "#F6F1E7"
      ],
      [
        "#E3FF9A",
        "#C7CC10",
        "#818166",
        "#0C2CC3"
      ],
      [
        "#E3FF9A",
        "#D3ED18",
        "#C2C4B4",
        "#0C2CC3"
      ]
    ]
  },
  {
    "id": "upload-mineral-05",
    "label": "Upload mineral 05 ",
    "palettes": [
      [
        "#050505",
        "#C6C0A0",
        "#8C8C8C",
        "#D9C8C1"
      ],
      [
        "#050505",
        "#FAF6EA",
        "#D9C8C1"
      ],
      [
        "#010101",
        "#60798B",
        "#DCD9C8",
        "#364759"
      ],
      [
        "#010101",
        "#B5B198",
        "#364759"
      ]
    ]
  },
  {
    "id": "upload-night-07",
    "label": "Upload Night 07 ",
    "palettes": [
      [
        "#1E011F",
        "#190013",
        "#E12BA9",
        "#D80B7A"
      ],
      [
        "#1E011F",
        "#87B2FF",
        "#D80B7A"
      ],
      [
        "#4F1535",
        "#1E1F24",
        "#FF5CCF",
        "#233940"
      ],
      [
        "#4F1535",
        "#F84622",
        "#233940"
      ]
    ]
  },
  {
    "id": "upload-saphire-quartz-06",
    "label": "Upload Saphire Quartz 06",
    "palettes": [
      [
        "#081599",
        "#080317",
        "#87B2FF",
        "#1E7AF1"
      ],
      [
        "#081599",
        "#8BCAFF",
        "#1E7AF1"
      ],
      [
        "#450580",
        "#A28CFB",
        "#806EFE",
        "#1B1FFC"
      ],
      [
        "#450580",
        "#16021F",
        "#1B1FFC"
      ],
      [
        "#C8C693",
        "#7C679F",
        "#34369B",
        "#24211A"
      ],
      [
        "#C8C693",
        "#3F2646",
        "#24211A"
      ],
      [
        "#1829FD",
        "#20094F",
        "#250DD5",
        "#150218"
      ],
      [
        "#1829FD",
        "#400E45",
        "#150218"
      ]
    ]
  },
  {
    "id": "upload-vibrant-eclectic-02",
    "label": "Upload Vibrant eclectic 02",
    "palettes": [
      [
        "#03639E",
        "#E79C71",
        "#DACAC9",
        "#0B0A25"
      ],
      [
        "#03639E",
        "#FBC3E6",
        "#233940",
        "#0B0A25"
      ],
      [
        "#BC352A",
        "#514306",
        "#FD2D78",
        "#F43B10"
      ],
      [
        "#BC352A",
        "#260F27",
        "#F43B10"
      ],
      [
        "#FB381D",
        "#9F89F1",
        "#DED0D0",
        "#5B7374"
      ],
      [
        "#FB381D",
        "#053D7C",
        "#D6B6EC",
        "#5B7374"
      ],
      [
        "#0B5F3D",
        "#ED2705",
        "#CB300A",
        "#081C1B"
      ],
      [
        "#0B5F3D",
        "#E80542",
        "#081C1B"
      ],
      [
        "#FD5035",
        "#1D020E",
        "#FC87C2",
        "#507176"
      ],
      [
        "#FD5035",
        "#1D020E",
        "#507176",
        "#2E484A"
      ],
      [
        "#FD5035",
        "#FC87C2",
        "#2E484A"
      ],
      [
        "#221337",
        "#D0CECA",
        "#0258BB",
        "#006EE8"
      ],
      [
        "#221337",
        "#D0CECA",
        "#79BEB2",
        "#FDE7B6"
      ],
      [
        "#221337",
        "#0258BB",
        "#2C0115",
        "#FDE7B6"
      ],
      [
        "#D60C1E",
        "#DB4630",
        "#ABB5EB",
        "#DB8307"
      ],
      [
        "#D60C1E",
        "#F2BC49",
        "#ABB5EB",
        "#DB8307"
      ]
    ]
  }
];

  const FORMULAS = [
    { id:'dominant-heavy', weights:[1.55,0.85,0.70,0.46], spread:0.46, flow:0.55, grain:0.14 },
    { id:'mist-heavy',     weights:[1.20,0.72,0.52,1.38], spread:0.38, flow:0.46, grain:0.13 },
    { id:'deep-shadow',    weights:[1.38,0.72,0.58,0.88], spread:0.42, flow:0.48, grain:0.16 },
    { id:'balanced-soft',  weights:[1.08,1.00,0.86,0.72], spread:0.58, flow:0.62, grain:0.15 },
    { id:'accent-pin',     weights:[1.25,0.88,0.64,0.34], spread:0.66, flow:0.54, grain:0.14 },
    { id:'equal-stress',   weights:[1.00,0.92,0.88,0.82], spread:0.72, flow:0.68, grain:0.17 }
  ];

  const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[Math.floor(Math.random()*arr.length)];
  const normalizeHex = (value, fallback) => {
    let h = String(value || '').trim();
    if (!h) return fallback || '#000000';
    if (h[0] !== '#') h = '#' + h;
    if (/^#[0-9a-fA-F]{3}$/.test(h)) h = '#' + h.slice(1).split('').map(c => c+c).join('');
    return /^#[0-9a-fA-F]{6}$/.test(h) ? h.toUpperCase() : (fallback || '#000000');
  };
  const uniquePalette = (colors) => (colors || []).map(c => normalizeHex(c)).filter((c,i,a)=>/^#[0-9A-F]{6}$/.test(c) && a.indexOf(c)===i);
  const keyFor = (p) => uniquePalette(p).join('|');
  const hexToRgb = (hex) => { const h=normalizeHex(hex).slice(1); return { r:parseInt(h.slice(0,2),16), g:parseInt(h.slice(2,4),16), b:parseInt(h.slice(4,6),16) }; };
  const rgbToHex = (r,g,b) => '#' + [r,g,b].map(v => clamp(Math.round(v),0,255).toString(16).padStart(2,'0')).join('').toUpperCase();
  const rgbToHsl = (rgb) => {
    let r=rgb.r/255,g=rgb.g/255,b=rgb.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),h=0,s=0,l=(max+min)/2;
    if(max!==min){let d=max-min;s=l>.5?d/(2-max-min):d/(max+min);if(max===r)h=(g-b)/d+(g<b?6:0);else if(max===g)h=(b-r)/d+2;else h=(r-g)/d+4;h*=60;}
    return {h,s,l};
  };
  const hslToRgb = (h,s,l) => {
    h=((h%360)+360)%360/360; let r,g,b;
    if(s===0){r=g=b=l;} else {
      const hue2rgb=(p,q,t)=>{if(t<0)t+=1;if(t>1)t-=1;if(t<1/6)return p+(q-p)*6*t;if(t<1/2)return q;if(t<2/3)return p+(q-p)*(2/3-t)*6;return p;};
      const q=l<.5?l*(1+s):l+s-l*s; const p=2*l-q;
      r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return {r:r*255,g:g*255,b:b*255};
  };
  const hslToHex = (h,s,l) => { const c=hslToRgb(h,s,l); return rgbToHex(c.r,c.g,c.b); };
  const mix = (a,b,t) => { const A=hexToRgb(a), B=hexToRgb(b); return rgbToHex(A.r+(B.r-A.r)*t,A.g+(B.g-A.g)*t,A.b+(B.b-A.b)*t); };
  const mutate = (hex, amount) => {
    const hsl = rgbToHsl(hexToRgb(hex));
    hsl.h += (Math.random()-.5) * 12 * amount;
    hsl.s = clamp(hsl.s + (Math.random()-.5) * .12 * amount, .04, .98);
    hsl.l = clamp(hsl.l + (Math.random()-.5) * .12 * amount, .035, .965);
    return hslToHex(hsl.h, hsl.s, hsl.l);
  };

  const visiblePresets = [];
  const hiddenPool = [];
  const seen = new Set();
  FAMILIES.forEach(f => {
    (f.palettes || []).forEach(p => {
      const clean = uniquePalette(p).slice(0,4);
      if (clean.length >= 2) {
        const key = keyFor(clean);
        if (!seen.has(key)) {
          seen.add(key);
          visiblePresets.push(clean);
          hiddenPool.push({ family:f.id, label:f.label, colors:clean });
        }
      }
    });
  });

  function colorType(hex) {
    const hsl = rgbToHsl(hexToRgb(hex));
    return {
      hex, h:hsl.h, s:hsl.s, l:hsl.l,
      dark:hsl.l < 0.22,
      light:hsl.l > 0.74,
      vivid:hsl.s > 0.58,
      muted:hsl.s < 0.28,
      energy: hsl.s * (1 - Math.abs(hsl.l - 0.52) * 1.12)
    };
  }

  function orderByWorkingHierarchy(colors, formulaId) {
    let cols = uniquePalette(colors).slice(0,4);
    if (cols.length < 2) return cols;
    while (cols.length < 4) {
      const base = pick(cols);
      const hsl = rgbToHsl(hexToRgb(base));
      const variant = hslToHex(hsl.h + (Math.random()-.5)*18, clamp(hsl.s + (Math.random()-.5)*.18,.08,.94), clamp(hsl.l + (Math.random()-.5)*.22,.05,.92));
      if (cols.indexOf(variant) === -1) cols.push(variant);
    }
    const typed = cols.map(colorType);
    const darkest = typed.slice().sort((a,b)=>a.l-b.l)[0];
    const lightest = typed.slice().sort((a,b)=>b.l-a.l)[0];
    const vivid = typed.slice().sort((a,b)=>b.energy-a.energy)[0];
    const accents = typed.slice().sort((a,b)=>b.s-a.s || Math.abs(b.l-.52)-Math.abs(a.l-.52));
    const f = formulaId || pick(FORMULAS).id;

    let ordered;
    if (f === 'deep-shadow') ordered = [darkest.hex, vivid.hex, lightest.hex, accents[1]?.hex || lightest.hex];
    else if (f === 'mist-heavy') ordered = [lightest.hex, vivid.hex, darkest.hex, accents[0]?.hex || vivid.hex];
    else if (f === 'accent-pin') ordered = [darkest.hex, lightest.hex, vivid.hex, accents[0]?.hex || vivid.hex];
    else if (f === 'balanced-soft') ordered = [vivid.hex, darkest.hex, lightest.hex, accents[1]?.hex || accents[0].hex];
    else if (f === 'equal-stress') ordered = typed.slice().sort((a,b)=>a.h-b.h).map(x=>x.hex);
    else ordered = [vivid.hex, darkest.hex, lightest.hex, accents[1]?.hex || accents[0].hex];

    ordered = uniquePalette(ordered);
    cols.forEach(c => { if (ordered.indexOf(c) === -1) ordered.push(c); });
    return ordered.slice(0,4);
  }

  function randomPalette(count, options) {
    const desired = clamp(Math.round(count || 4), 2, 4);
    const formula = pick(FORMULAS);
    const src = pick(hiddenPool.length ? hiddenPool : visiblePresets.map(p=>({colors:p})));
    let colors = orderByWorkingHierarchy(src.colors, formula.id);

    // The rated data showed better results when there is usually a dark anchor,
    // a vivid body colour, and either a pale/muted mist or a small bright accent.
    // This nudges weak palettes toward that structure without making everything samey.
    const info = colors.map(colorType);
    const hasDark = info.some(c => c.l < 0.25);
    const hasLight = info.some(c => c.l > 0.72);
    const hasVivid = info.some(c => c.s > 0.55);
    if (!hasDark && Math.random() < 0.62) colors[1] = mix(colors[1] || colors[0], '#05040A', 0.58);
    if (!hasLight && Math.random() < 0.46) colors[2] = mix(colors[2] || colors[0], '#F7FAFB', 0.50);
    if (!hasVivid && Math.random() < 0.55) colors[0] = mutate(colors[0], 0.8);

    colors = colors.map((c,i) => i === 0 ? mutate(c, 0.18) : mutate(c, 0.10));
    colors = uniquePalette(colors).slice(0, desired);
    while (colors.length < desired) colors.push(mutate(pick(colors), 0.65));
    return colors.slice(0, desired);
  }

  function randomizeTweaks(current, count, options) {
    const formula = pick(FORMULAS);
    const colors = randomPalette(count || (current?.colors?.length || 4), { formula: formula.id });
    return {
      colors,
      spread: formula.spread,
      flow: formula.flow,
      grain: formula.grain,
      pigment: current?.pigment ?? 0.56,
      saturation: current?.saturation ?? 0.54,
      temperature: current?.temperature ?? 0,
      textureSeed: Math.random()
    };
  }

  function installPresets() {
    window.WP = window.WP || {};
    window.WP.PALETTE_PRESETS = window.WP.PALETTE_PRESETS || [];
    const existing = new Set(window.WP.PALETTE_PRESETS.map(keyFor));
    visiblePresets.forEach(p => {
      const key = keyFor(p);
      if (!existing.has(key)) { window.WP.PALETTE_PRESETS.push(p); existing.add(key); }
    });
  }

  installPresets();

  window.NURR_GRADIENT_PALETTE_ENGINE = {
    families: FAMILIES,
    formulas: FORMULAS,
    visiblePresets,
    hiddenPool,
    installPresets,
    randomPalette,
    randomizeTweaks,
    orderByWorkingHierarchy
  };
}());

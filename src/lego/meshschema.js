/** GPT-6 Astra is the current most capable OpenAI model, and it reads text and images. */
export const MODEL_ID = 'gpt-6-astra'

export const BRICK_COLORS = [
  '#1C2830',
  '#F4F4F4',
  '#6C6E68',
  '#A0A5A9',
  '#E4CD9E',
  '#582A12',
  '#C91A09',
  '#0055BF',
  '#FE8A18',
  '#F2CD37',
  '#237841',
  '#E4ADC8',
  '#923978',
  '#AA7F2E',
  '#9ED6F0',
  '#BBE90B',
]

const vec3 = { type: 'array', items: { type: 'number' } }
const vec2 = { type: 'array', items: { type: 'number' } }

export const MESH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'parts'],
  properties: {
    name: { type: 'string', description: 'Short name of the object, such as Teapot or Surfboard.' },
    parts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shape', 'name', 'color', 'position', 'size', 'radius', 'axis', 'profile', 'path'],
        properties: {
          shape: {
            type: 'string',
            enum: ['box', 'rounded', 'cylinder', 'cone', 'ellipsoid', 'lathe', 'tube', 'gable'],
          },
          name: { type: 'string' },
          color: { type: 'string', enum: BRICK_COLORS },
          position: { ...vec3, description: 'Center of the part. Y is up. The object faces +Z.' },
          size: { ...vec3, description: 'Width, height, depth. Use [0,0,0] for lathe and tube.' },
          radius: { type: 'number', description: 'Tube thickness, or corner radius of a rounded slab. Otherwise 0.' },
          axis: { type: 'string', enum: ['y', 'x', 'z'], description: 'Length axis of a cylinder or cone. Y is upright.' },
          profile: {
            type: 'array',
            items: vec2,
            description: 'Lathe outline as [radius, y] pairs, y centered on the part, tracing the real profile. Otherwise [].',
          },
          path: {
            type: 'array',
            items: vec3,
            description: 'Tube centerline as [x, y, z] offsets from position, tracing the real curve. Otherwise [].',
          },
        },
      },
    },
  },
}

export const MESH_INSTRUCTIONS = [
  'Build a recognizable model of the specific object, then keep it solid enough to sample into LEGO plates with vertical rays.',
  'Match the real proportions and the side silhouette. A viewer should be able to name the object from the side without reading the label.',
  'Include the features that identify it, at their real relative size. A bill, neck, tail, ear, spout, handle, or roof stays long if the real one is long. Do not shrink one of those into a stub, and do not replace the object with a ball or a stack of ovals.',
  'Use 8 to 14 parts when the shape is distinct. Spend the parts on the silhouette. Skip wires, engraving, and any bump smaller than 0.16.',
  'The longest side of the whole object is about 1.6. Every part is at least 0.16 thick in every direction, including handles, spouts, fins, lids, bills, and boards.',
  'A projecting part such as a bill, spout, ear, or tail extends at least 0.25 past the body.',
  'Each part is a filled volume a ray can enter and leave. Never return a shell, a plane, an open bowl, or a single-thickness wall.',
  'Give the object a broad flat bottom at least 0.2 thick, so the first courses are a base later plates can clutch.',
  'Overlap neighboring parts by about 0.05. A lid sits down into the body, a roof sits down on the walls, a neck or wheel enters the body. Do not leave a gap.',
  'Y is up. The object faces +Z. position is the center of the part.',
  'box, rounded, cylinder, cone, and ellipsoid use size as width, height, depth. cylinder and cone run along axis.',
  'rounded is a slab with curved corners; radius is the corner radius, and the slab stays at least 0.16 thick.',
  'gable is a pitched roof; size is width, depth, ridge height. Make the roof thick enough to sit on the walls.',
  'lathe is a turned solid whose profile follows the real outline. profile is [radius, y] with y centered on 0, at least 6 points, ends near radius 0.02, and the belly radius stays above 0.16. size is [0,0,0], path is []. Use it for bodies, pots, bottles, and cups.',
  'tube is a solid bent rod. path is 4 to 6 points as offsets from position and must follow the real curve. Do not use a straight vertical path unless the real part is straight. radius is at least 0.08 so the rod is 0.16 thick. size and profile are empty. Use it for necks, tails, handles, and spouts.',
  'Use gable for a house roof. A long object such as a board runs along Z and stays at least 0.16 thick.',
  'Give each recognizable color region its own part. Pick the nearest color from the allowed list. Honor color words in the sentence.',
  'When a picture is attached, match its silhouette, proportions, and part colors, and ignore the background. Thicken thin details up to 0.16 rather than dropping them.',
  'When a sentence is attached, build that exact object, including the features that identify it.',
  'Do not return one ball unless the object is a ball, planet, or fruit.',
].join(' ')

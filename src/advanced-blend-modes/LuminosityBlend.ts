import { ExtensionType } from '../extensions/Extensions';
import { BlendModeFilter } from '../filters/blend-modes/BlendModeFilter';
import { hslgl } from '../filters/blend-modes/hls/GLhls';
import { hslgpu } from '../filters/blend-modes/hls/GPUhls';

import type { ExtensionMetadata } from '../extensions/Extensions';

/**
 * The final color has the luminosity of the top color, while using the hue and saturation of the bottom color.
 * This blend mode is equivalent to color, but with the layers swapped.
 *
 * Available as `container.blendMode = 'luminosity'` after importing `pixi.js/advanced-blend-modes`.
 * @example
 * import 'pixi.js/advanced-blend-modes';
 * import { Sprite } from 'pixi.js';
 *
 * const sprite = Sprite.from('something.png');
 * sprite.blendMode = 'luminosity'
 * @category filters
 */
export class LuminosityBlend extends BlendModeFilter
{
    /** @ignore */
    public static extension: ExtensionMetadata = {
        name: 'luminosity',
        type: ExtensionType.BlendMode
    };

    constructor()
    {
        super({
            gl: {
                functions: `
                ${hslgl}

                vec3 blendLuminosity(vec3 base, vec3 blend,  float opacity)
                {
                    vec3 blendLuminosity = setLuminosity(base, getLuminosity(blend));
                    return (blendLuminosity * opacity + base * (1.0 - opacity));
                }
                `,
                main: `
                finalColor = vec4(blendLuminosity(back.rgb, front.rgb,front.a), blendedAlpha) * uBlend;
                `
            },
            gpu: {
                functions: `
                ${hslgpu}

                fn blendLuminosity(base:vec3<f32>,  blend:vec3<f32>,  opacity:f32) -> vec3<f32>
                {
                    let blendLuminosity: vec3<f32> = setLuminosity(base, getLuminosity(blend));
                    return (blendLuminosity * opacity + base * (1.0 - opacity));
                }
            `,
                main: `
                out = vec4<f32>(blendLuminosity(back.rgb, front.rgb, front.a), blendedAlpha) * blendUniforms.uBlend;
            `
            }
        });
    }
}

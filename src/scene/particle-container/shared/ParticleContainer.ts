import { Bounds } from '../../container/bounds/Bounds';
import { type IRenderLayer } from '../../layers/RenderLayer';
import { ViewContainer, type ViewContainerOptions } from '../../view/ViewContainer';
import { type ParticleBuffer } from './ParticleBuffer';
import { particleData } from './particleData';

import type { Instruction } from '../../../rendering/renderers/shared/instructions/Instruction';
import type { Shader } from '../../../rendering/renderers/shared/shader/Shader';
import type { Texture } from '../../../rendering/renderers/shared/texture/Texture';
import type { ContainerChild } from '../../container/Container';
import type { DestroyOptions } from '../../container/destroyTypes';
import type { IParticle } from './Particle';
import type { ParticleRendererProperty } from './particleData';

const emptyBounds = new Bounds(0, 0, 0, 0);

/**
 * Represents the properties of a particle that can be dynamically updated.
 * @property {boolean} [vertices] - Indicates if vertices are dynamic.
 * @property {boolean} [position] - Indicates if position is dynamic.
 * @property {boolean} [rotation] - Indicates if rotation is dynamic.
 * @property {boolean} [uvs] - Indicates if UVs are dynamic.
 * @property {boolean} [color] - Indicates if color is dynamic.
 * @category scene
 */
export interface ParticleProperties
{
    vertex?: boolean;
    position?: boolean;
    rotation?: boolean;
    uvs?: boolean;
    color?: boolean;
}

/**
 * Options for the ParticleContainer constructor.
 * @category scene
 */
export interface ParticleContainerOptions extends PixiMixins.ParticleContainerOptions, Omit<ViewContainerOptions, 'children'>
{
    /** Specifies which properties are dynamic. */
    dynamicProperties?: Record<string, boolean>;
    /** The shader to use for rendering particles. */
    shader?: Shader;
    /** Indicates if pixels should be rounded. */
    roundPixels?: boolean;
    /** The texture to use for rendering particles. If not provided, the texture of the first child is used. */
    texture?: Texture;
    /** An array of particles to add to the container. */
    particles?: IParticle[];
}
// eslint-disable-next-line requireExport/require-export-jsdoc
export interface ParticleContainer extends PixiMixins.ParticleContainer, ViewContainer<ParticleBuffer> {}

/**
 * The ParticleContainer class is a highly optimized container that can render 1000s or particles at great speed.
 *
 * A ParticleContainer is specialized in that it can only contain and render particles. Particles are
 * lightweight objects that use minimal memory, which helps boost performance.
 *
 * It can render particles EXTREMELY fast!
 *
 * The tradeoff of using a ParticleContainer is that most advanced functionality is unavailable. Particles are simple
 * and cannot have children, filters, masks, etc. They possess only the basic properties: position, scale, rotation,
 * and color.
 *
 * All particles must share the same texture source (using something like a sprite sheet works well here).
 *
 * When creating a ParticleContainer, a developer can specify which of these properties are static and which are dynamic.
 * - Static properties are only updated when you add or remove a child, or when the `update` function is called.
 * - Dynamic properties are updated every frame.
 *
 * It is up to the developer to specify which properties are static and which are dynamic. Generally, the more static
 * properties you have (i.e., those that do not change per frame), the faster the rendering.
 *
 * If the developer modifies the children order or any static properties of the particle, they must call the `update` method.
 *
 * By default, only the `position` property is set to dynamic, which makes rendering very fast!
 *
 * Developers can also provide a custom shader to the particle container, allowing them to render particles in a custom way.
 *
 * To help with performance, the particle containers bounds are not calculated.
 * It's up to the developer to set the boundsArea property.
 *
 * It's extremely easy to use. Below is an example of rendering thousands of sprites at lightning speed.
 *
 * --------- EXPERIMENTAL ---------
 *
 * This is a new API, things may change and it may not work as expected.
 * We want to hear your feedback as we go!
 *
 * --------------------------------
 * @example
 * import { ParticleContainer, Particle } from 'pixi.js';
 *
 * const container = new ParticleContainer();
 *
 * for (let i = 0; i < 100; ++i)
 * {
 *     let particle = new Particle(texture);
 *     container.addParticle(particle);
 * }
 * @category scene
 */
export class ParticleContainer extends ViewContainer<ParticleBuffer> implements Instruction
{
    /**
     * Defines the default options for creating a ParticleContainer.
     * @property {Record<string, boolean>} dynamicProperties - Specifies which properties are dynamic.
     * @property {boolean} roundPixels - Indicates if pixels should be  rounded.
     */
    public static defaultOptions: ParticleContainerOptions = {
        /** Specifies which properties are dynamic. */
        dynamicProperties: {
            /** Indicates if vertex positions are dynamic. */
            vertex: false,
            /** Indicates if particle positions are dynamic. */
            position: true,
            /** Indicates if particle rotations are dynamic. */
            rotation: false,
            /** Indicates if UV coordinates are dynamic. */
            uvs: false,
            /** Indicates if particle colors are dynamic. */
            color: false,
        },
        /** Indicates if pixels should be rounded for rendering. */
        roundPixels: false
    };

    /** The unique identifier for the render pipe of this ParticleContainer. */
    public override readonly renderPipeId: string = 'particle';

    public batched = false;

    /**
     * A record of properties and their corresponding ParticleRendererProperty.
     * @internal
     */
    public _properties: Record<string, ParticleRendererProperty>;

    /**
     * Indicates if the children of this ParticleContainer have changed and need to be updated.
     * @internal
     */
    public _childrenDirty = false;

    /**
     * An array of particles that are children of this ParticleContainer.
     * it can be modified directly, after which the 'update' method must be called.
     * to ensure the container is rendered correctly.
     */
    public particleChildren: IParticle[];

    /** The shader used for rendering particles in this ParticleContainer. */
    public shader: Shader;

    /**
     * The texture used for rendering particles in this ParticleContainer.
     * Defaults to the first childs texture if not set
     */
    public texture: Texture;

    /**
     * @param options - The options for creating the sprite.
     */
    constructor(options: ParticleContainerOptions = {})
    {
        options = {
            ...ParticleContainer.defaultOptions,
            ...options,
            dynamicProperties: {
                ...ParticleContainer.defaultOptions.dynamicProperties,
                ...options?.dynamicProperties,
            },
        };

        // split out
        const { dynamicProperties, shader, roundPixels, texture, particles, ...rest } = options;

        super({
            label: 'ParticleContainer',
            ...rest,
        });

        this.texture = texture || null;
        this.shader = shader;

        this._properties = {};

        for (const key in particleData)
        {
            const property = particleData[key];
            const dynamic = dynamicProperties[key];

            this._properties[key] = {
                ...property,
                dynamic,
            };
        }

        this.allowChildren = true;
        this.roundPixels = roundPixels ?? false;

        this.particleChildren = particles ?? [];
    }

    /**
     * Adds one or more particles to the container.
     *
     * Multiple items can be added like so: `myContainer.addParticle(thingOne, thingTwo, thingThree)`
     * @param {...IParticle} children - The Particle(s) to add to the container
     * @returns {IParticle} - The first child that was added.
     */
    public addParticle(...children: IParticle[]): IParticle
    {
        for (let i = 0; i < children.length; i++)
        {
            this.particleChildren.push(children[i]);
        }

        this.onViewUpdate();

        return children[0];
    }

    /**
     * Removes one or more particles from the container.
     * @param {...IParticle} children - The Particle(s) to remove
     * @returns {IParticle} The first child that was removed.
     */
    public removeParticle(...children: IParticle[]): IParticle
    {
        let didRemove = false;

        for (let i = 0; i < children.length; i++)
        {
            const index = this.particleChildren.indexOf(children[i] as IParticle);

            if (index > -1)
            {
                this.particleChildren.splice(index, 1);
                didRemove = true;
            }
        }

        if (didRemove) this.onViewUpdate();

        return children[0];
    }

    /**
     * Updates the particle container.
     * Please call this when you modify the particleChildren array.
     * or any static properties of the particles.
     */
    public update()
    {
        this._childrenDirty = true;
    }

    protected override onViewUpdate()
    {
        this._childrenDirty = true;
        super.onViewUpdate();
    }

    /**
     * ParticleContainer does not calculated bounds as it would slow things down,
     * its up to you to set this via the boundsArea property
     */
    public get bounds()
    {
        return emptyBounds;
    }

    /** @private */
    protected override updateBounds(): void { /* empty */ }

    /**
     * Destroys this sprite renderable and optionally its texture.
     * @param options - Options parameter. A boolean will act as if all options
     *  have been set to that value
     * @example
     * particleContainer.destroy();
     * particleContainer.destroy(true);
     * particleContainer.destroy({ texture: true, textureSource: true, children: true });
     */
    public override destroy(options: DestroyOptions = false)
    {
        super.destroy(options);

        const destroyTexture = typeof options === 'boolean' ? options : options?.texture;

        if (destroyTexture)
        {
            const destroyTextureSource = typeof options === 'boolean' ? options : options?.textureSource;

            const texture = this.texture ?? this.particleChildren[0]?.texture;

            if (texture)
            {
                texture.destroy(destroyTextureSource);
            }
        }

        this.texture = null;
        this.shader?.destroy();
    }

    /**
     * Removes all particles from this container that are within the begin and end indexes.
     * @param beginIndex - The beginning position.
     * @param endIndex - The ending position. Default value is size of the container.
     * @returns - List of removed particles
     */
    public removeParticles(beginIndex?: number, endIndex?: number)
    {
        beginIndex ??= 0;
        endIndex ??= this.particleChildren.length;

        // Remove the correct range
        const children = this.particleChildren.splice(
            beginIndex,
            endIndex - beginIndex
        );

        this.onViewUpdate();

        return children;
    }

    /**
     * Removes a particle from the specified index position.
     * @param index - The index to get the particle from
     * @returns The particle that was removed.
     */
    public removeParticleAt<U extends IParticle>(index: number): U
    {
        const child = this.particleChildren.splice(index, 1);

        this.onViewUpdate();

        return child[0] as U;
    }

    /**
     * Adds a particle to the container at a specified index. If the index is out of bounds an error will be thrown.
     * If the particle is already in this container, it will be moved to the specified index.
     * @param {Container} child - The particle to add.
     * @param {number} index - The absolute index where the particle will be positioned at the end of the operation.
     * @returns {Container} The particle that was added.
     */
    public addParticleAt<U extends IParticle>(child: U, index: number): U
    {
        this.particleChildren.splice(index, 0, child);

        this.onViewUpdate();

        return child;
    }

    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.addParticle()` instead.
     * @param {...any} _children
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override addChild<U extends(ContainerChild | IRenderLayer)[]>(..._children: U): U[0]
    {
        throw new Error(
            'ParticleContainer.addChild() is not available. Please use ParticleContainer.addParticle()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     * Calling this method will throw an error. Please use `ParticleContainer.removeParticle()` instead.
     * @param {...any} _children
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override removeChild<U extends(ContainerChild | IRenderLayer)[]>(..._children: U): U[0]
    {
        throw new Error(
            'ParticleContainer.removeChild() is not available. Please use ParticleContainer.removeParticle()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.removeParticles()` instead.
     * @param {number} [_beginIndex]
     * @param {number} [_endIndex]
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override removeChildren(_beginIndex?: number, _endIndex?: number): ContainerChild[]
    {
        throw new Error(
            'ParticleContainer.removeChildren() is not available. Please use ParticleContainer.removeParticles()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.removeParticleAt()` instead.
     * @param {number} _index
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override removeChildAt<U extends(ContainerChild | IRenderLayer)>(_index: number): U
    {
        throw new Error(
            'ParticleContainer.removeChildAt() is not available. Please use ParticleContainer.removeParticleAt()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.getParticleAt()` instead.
     * @param {number} _index
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override getChildAt<U extends(ContainerChild | IRenderLayer)>(_index: number): U
    {
        throw new Error(
            'ParticleContainer.getChildAt() is not available. Please use ParticleContainer.getParticleAt()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.setParticleIndex()` instead.
     * @param {ContainerChild} _child
     * @param {number} _index
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override setChildIndex(_child: ContainerChild, _index: number): void
    {
        throw new Error(
            'ParticleContainer.setChildIndex() is not available. Please use ParticleContainer.setParticleIndex()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.getParticleIndex()` instead.
     * @param {ContainerChild} _child
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override getChildIndex(_child: ContainerChild): number
    {
        throw new Error(
            'ParticleContainer.getChildIndex() is not available. Please use ParticleContainer.getParticleIndex()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.addParticleAt()` instead.
     * @param {ContainerChild} _child
     * @param {number} _index
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override addChildAt<U extends(ContainerChild | IRenderLayer)>(_child: U, _index: number): U
    {
        throw new Error(
            'ParticleContainer.addChildAt() is not available. Please use ParticleContainer.addParticleAt()',
        );
    }
    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error. Please use `ParticleContainer.swapParticles()` instead.
     * @param {ContainerChild} _child
     * @param {ContainerChild} _child2
     */
    public override swapChildren<U extends(ContainerChild | IRenderLayer)>(_child: U, _child2: U): void
    {
        throw new Error(
            'ParticleContainer.swapChildren() is not available. Please use ParticleContainer.swapParticles()',
        );
    }

    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error.
     * @param _child - The child to reparent
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override reparentChild(..._child: ContainerChild[]): any
    {
        throw new Error('ParticleContainer.reparentChild() is not available with the particle container');
    }

    /**
     * This method is not available in ParticleContainer.
     *
     * Calling this method will throw an error.
     * @param _child - The child to reparent
     * @param _index - The index to reparent the child to
     * @throws {Error} Always throws an error as this method is not available.
     */
    public override reparentChildAt(_child: ContainerChild, _index: number): any
    {
        throw new Error('ParticleContainer.reparentChildAt() is not available with the particle container');
    }
}

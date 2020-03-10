import { select } from "d3-selection"
import { first, last, sortBy, find } from "./Util"
import * as React from "react"
import { Bounds } from "./Bounds"
import { getRelativeMouse, formatMoment } from "./Util"
import { Analytics } from "site/client/Analytics"
import {
    observable,
    computed,
    autorun,
    action,
    runInAction,
    IReactionDisposer
} from "mobx"
import { observer } from "mobx-react"
import { ChartViewContext, ChartViewContextType } from "./ChartViewContext"
import { faPlay } from "@fortawesome/free-solid-svg-icons/faPlay"
import { faPause } from "@fortawesome/free-solid-svg-icons/faPause"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"

interface TimelineProps {
    moments: number[]
    startMoment: number
    endMoment: number
    onTargetChange: ({
        targetStartMoment,
        targetEndMoment
    }: {
        targetStartMoment: number
        targetEndMoment: number
    }) => void
    onInputChange?: ({
        startMoment,
        endMoment
    }: {
        startMoment: number
        endMoment: number
    }) => void
    onStartDrag?: () => void
    onStopDrag?: () => void
    singleMomentMode?: boolean
    singleMomentPlay?: boolean
    disablePlay?: boolean
}

@observer
export class Timeline extends React.Component<TimelineProps> {
    base: React.RefObject<HTMLDivElement> = React.createRef()

    static contextType = ChartViewContext
    context!: ChartViewContextType

    disposers!: IReactionDisposer[]

    @observable startMomentInput: number = 1900
    @observable endMomentInput: number = 2000
    @observable isPlaying: boolean = false
    @observable dragTarget?: string

    @computed get isDragging(): boolean {
        return !!this.dragTarget
    }

    constructor(props: TimelineProps) {
        super(props)

        if (this.props.moments.length === 0) {
            // Lots of stuff in this class assumes the moments array is non-empty,
            // see e.g. minMoment, maxMoment, targetStartMoment, targetEndMoment. Should
            // deal with this more gracefully -@jasoncrawford 2019-12-17
            console.warn("invoking HTMLTimeline with empty moments array")
        }

        runInAction(() => {
            this.startMomentInput = props.startMoment
            this.endMomentInput = props.endMoment
        })
    }

    componentDidUpdate() {
        const { isPlaying, isDragging } = this
        if (!isPlaying && !isDragging) {
            runInAction(() => {
                this.startMomentInput = this.props.startMoment
                this.endMomentInput = this.props.endMoment
            })
        }
    }

    @computed get moments(): number[] {
        return this.props.moments
    }

    @computed get minMoment(): number {
        // This cast is necessary because `moments` might be empty. Should deal
        // with an empty moments array more gracefully -@jasoncrawford 2019-12-17
        return first(this.props.moments) as number
    }

    @computed get maxMoment(): number {
        // This cast is necessary because `moments` might be empty. Should deal
        // with an empty moments array more gracefully -@jasoncrawford 2019-12-17
        return last(this.props.moments) as number
    }

    // Sanity check the input
    @computed get startMoment(): number {
        const { startMomentInput, endMomentInput, minMoment, maxMoment } = this
        return Math.min(
            maxMoment,
            Math.max(minMoment, Math.min(startMomentInput, endMomentInput))
        )
    }

    // Closest moment to the input start moment
    // e.g. 1954 => 1955
    @computed get roundedStartMoment(): number {
        const { moments, startMoment } = this
        return sortBy(moments, moment => Math.abs(moment - startMoment))[0]
    }

    // Previous moment from the input start moment
    // e.g. 1954 => 1950
    @computed get targetStartMoment(): number {
        const { moments, startMoment } = this
        return find(
            sortBy(moments, moment => Math.abs(moment - startMoment)),
            moment => moment <= startMoment
        ) as number
    }

    @computed get endMoment(): number {
        const { startMomentInput, endMomentInput, minMoment, maxMoment } = this
        return Math.min(
            maxMoment,
            Math.max(minMoment, Math.max(startMomentInput, endMomentInput))
        )
    }

    @computed get roundedEndMoment(): number {
        const { moments, endMoment } = this
        return sortBy(moments, moment => Math.abs(moment - endMoment))[0]
    }

    @computed get targetEndMoment(): number {
        const { moments, endMoment } = this
        return find(
            sortBy(moments, moment => Math.abs(moment - endMoment)),
            moment => moment <= endMoment
        ) as number
    }

    animRequest?: number

    @action.bound onStartPlaying() {
        Analytics.logEvent("CHART_TIMELINE_PLAY")

        let lastTime: number | undefined
        const ticksPerSec = 5

        const playFrame = action((time: number) => {
            const { isPlaying, endMoment, moments, minMoment, maxMoment } = this
            if (!isPlaying) return

            if (lastTime === undefined) {
                // If we start playing from the end, loop around to beginning
                if (endMoment >= maxMoment) {
                    this.startMomentInput = minMoment
                    this.endMomentInput = minMoment
                }
            } else {
                const elapsed = time - lastTime

                if (endMoment >= maxMoment) {
                    this.isPlaying = false
                } else {
                    const nextMoment = moments[moments.indexOf(endMoment) + 1]
                    const momentsToNext = nextMoment - endMoment

                    this.endMomentInput =
                        endMoment +
                        (Math.max(momentsToNext / 3, 1) *
                            elapsed *
                            ticksPerSec) /
                            1000
                    if (
                        this.props.singleMomentMode ||
                        this.props.singleMomentPlay
                    )
                        this.startMomentInput = this.endMomentInput
                }
            }

            lastTime = time
            this.animRequest = requestAnimationFrame(playFrame)
        })

        this.animRequest = requestAnimationFrame(playFrame)
    }

    onStopPlaying() {
        if (this.animRequest !== undefined)
            cancelAnimationFrame(this.animRequest)
    }

    get sliderBounds() {
        const slider = this.base.current!.querySelector(".slider")
        return slider
            ? Bounds.fromRect(slider.getBoundingClientRect())
            : new Bounds(0, 0, 100, 100)
    }

    getInputMomentFromMouse(evt: MouseEvent) {
        const slider = this.base.current!.querySelector(
            ".slider"
        ) as HTMLDivElement
        const sliderBounds = slider.getBoundingClientRect()

        const { minMoment, maxMoment } = this
        const mouseX = getRelativeMouse(slider, evt).x

        const fracWidth = mouseX / sliderBounds.width
        const inputMoment = minMoment + fracWidth * (maxMoment - minMoment)

        return inputMoment
    }

    dragOffsets = [0, 0]

    @action.bound onDrag(inputMoment: number) {
        const { props, dragTarget, minMoment, maxMoment } = this

        if (
            props.singleMomentMode ||
            (this.isPlaying && this.props.singleMomentPlay)
        ) {
            this.startMomentInput = inputMoment
            this.endMomentInput = inputMoment
        } else if (dragTarget === "start") this.startMomentInput = inputMoment
        else if (dragTarget === "end") this.endMomentInput = inputMoment
        else if (dragTarget === "both") {
            this.startMomentInput = this.dragOffsets[0] + inputMoment
            this.endMomentInput = this.dragOffsets[1] + inputMoment

            if (this.startMomentInput < minMoment) {
                this.startMomentInput = minMoment
                this.endMomentInput =
                    minMoment + (this.dragOffsets[1] - this.dragOffsets[0])
            } else if (this.endMomentInput > maxMoment) {
                this.startMomentInput =
                    maxMoment + (this.dragOffsets[0] - this.dragOffsets[1])
                this.endMomentInput = maxMoment
            }
        }
    }

    @action.bound onMouseDown(e: any) {
        // Don't do mousemove if we clicked the play or pause button
        const targetEl = select(e.target)
        if (targetEl.classed("toggle")) return

        const { startMoment, endMoment } = this
        const { singleMomentMode } = this.props

        const inputMoment = this.getInputMomentFromMouse(e)
        if (
            startMoment === endMoment &&
            (targetEl.classed("startMarker") || targetEl.classed("endMarker"))
        )
            this.dragTarget = "both"
        else if (
            !singleMomentMode &&
            (targetEl.classed("startMarker") || inputMoment <= startMoment)
        )
            this.dragTarget = "start"
        else if (
            !singleMomentMode &&
            (targetEl.classed("endMarker") || inputMoment >= endMoment)
        )
            this.dragTarget = "end"
        else this.dragTarget = "both"

        if (this.dragTarget === "both")
            this.dragOffsets = [
                this.startMomentInput - inputMoment,
                this.endMomentInput - inputMoment
            ]

        this.onDrag(inputMoment)

        e.preventDefault()
    }

    @action.bound onDoubleClick(e: any) {
        const inputMoment = this.getInputMomentFromMouse(e)
        this.startMomentInput = inputMoment
        this.endMomentInput = inputMoment
    }

    queuedAnimationFrame?: number

    @action.bound onMouseMove(ev: MouseEvent | TouchEvent) {
        const { dragTarget, queuedAnimationFrame } = this
        if (!dragTarget) return
        if (queuedAnimationFrame) cancelAnimationFrame(queuedAnimationFrame)

        this.queuedAnimationFrame = requestAnimationFrame(() => {
            this.onDrag(this.getInputMomentFromMouse(ev as any))
        })
    }

    @action.bound onMouseUp() {
        this.dragTarget = undefined
    }

    // Allow proper dragging behavior even if mouse leaves timeline area
    componentDidMount() {
        document.documentElement.addEventListener("mouseup", this.onMouseUp)
        document.documentElement.addEventListener("mouseleave", this.onMouseUp)
        document.documentElement.addEventListener("mousemove", this.onMouseMove)
        document.documentElement.addEventListener("touchend", this.onMouseUp)
        document.documentElement.addEventListener("touchmove", this.onMouseMove)

        this.disposers = [
            autorun(() => {
                const { isPlaying } = this

                if (isPlaying) this.onStartPlaying()
                else this.onStopPlaying()
            }),
            autorun(() => {
                const { isPlaying, isDragging } = this
                const { onStartDrag, onStopDrag } = this.props
                if (isPlaying || isDragging) {
                    this.context.chart.url.debounceMode = true
                    if (onStartDrag) onStartDrag()
                } else {
                    this.context.chart.url.debounceMode = false
                    if (onStopDrag) onStopDrag()
                }
            }),
            autorun(
                () => {
                    if (this.props.onInputChange)
                        this.props.onInputChange({
                            startMoment: this.startMoment,
                            endMoment: this.endMoment
                        })
                },
                { delay: 0 }
            ),
            autorun(
                () => {
                    if (this.props.onTargetChange)
                        this.props.onTargetChange({
                            targetStartMoment: this.targetStartMoment,
                            targetEndMoment: this.targetEndMoment
                        })
                },
                { delay: 0 }
            ),
            autorun(() => {
                // If we're not playing or dragging, lock the input to the closest moment (no interpolation)
                const {
                    isPlaying,
                    isDragging,
                    roundedStartMoment,
                    roundedEndMoment
                } = this
                if (!isPlaying && !isDragging) {
                    action(() => {
                        this.startMomentInput = roundedStartMoment
                        this.endMomentInput = roundedEndMoment
                    })()
                }
            })
        ]
    }

    componentWillUnmount() {
        document.documentElement.removeEventListener("mouseup", this.onMouseUp)
        document.documentElement.removeEventListener(
            "mouseleave",
            this.onMouseUp
        )
        document.documentElement.removeEventListener(
            "mousemove",
            this.onMouseMove
        )
        document.documentElement.removeEventListener("touchend", this.onMouseUp)
        document.documentElement.removeEventListener(
            "touchmove",
            this.onMouseMove
        )
        this.disposers.forEach(dispose => dispose())
    }

    @action.bound onTogglePlay() {
        this.isPlaying = !this.isPlaying
    }

    render() {
        const { minMoment, maxMoment, isPlaying, startMoment, endMoment } = this

        const startMomentProgress =
            (startMoment - minMoment) / (maxMoment - minMoment)
        const endMomentProgress =
            (endMoment - minMoment) / (maxMoment - minMoment)

        return (
            <div
                ref={this.base}
                className={"clickable TimelineControl"}
                onTouchStart={this.onMouseDown}
                onMouseDown={this.onMouseDown}
            >
                {!this.props.disablePlay && (
                    <div
                        onMouseDown={e => e.stopPropagation()}
                        onClick={this.onTogglePlay}
                    >
                        {isPlaying ? (
                            <FontAwesomeIcon icon={faPause} />
                        ) : (
                            <FontAwesomeIcon icon={faPlay} />
                        )}
                    </div>
                )}
                <div>{formatMoment(minMoment)}</div>
                <div className="slider">
                    <div
                        className="handle startMarker"
                        style={{ left: `${startMomentProgress * 100}%` }}
                    />
                    <div
                        className="interval"
                        style={{
                            left: `${startMomentProgress * 100}%`,
                            right: `${100 - endMomentProgress * 100}%`
                        }}
                    />
                    <div
                        className="handle endMarker"
                        style={{ left: `${endMomentProgress * 100}%` }}
                    />
                </div>
                <div>{formatMoment(maxMoment)}</div>
            </div>
        )
    }
}

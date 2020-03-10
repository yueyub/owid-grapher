import { findClosestMoment, getStartEndValues, DataValue } from "../Util"

function iteratorFromArray<T>(array: T[]): Iterable<T> {
    return array[Symbol.iterator]()
}

describe(findClosestMoment, () => {
    describe("without tolerance", () => {
        describe("array", () => {
            it("returns the correct moment", () => {
                const moment = [2010, 2015, 2017]
                expect(findClosestMoment(moment, 2015, 0)).toEqual(2015)
            })
            it("returns undefined", () => {
                const moments = [2010, 2015, 2017]
                expect(findClosestMoment(moments, 2014, 0)).toEqual(undefined)
            })
        })

        describe("iterator", () => {
            it("returns the correct moment", () => {
                const moments = iteratorFromArray([2010, 2015, 2017])
                expect(findClosestMoment(moments, 2015, 0)).toEqual(2015)
            })
            it("returns undefined", () => {
                const moments = iteratorFromArray([2010, 2015, 2017])
                expect(findClosestMoment(moments, 2014, 0)).toEqual(undefined)
            })
        })
    })

    describe("specified tolerance", () => {
        it("returns the closest moment within the specified tolerance", () => {
            const moments = [2010, 2015, 2017]
            expect(findClosestMoment(moments, 2013, 2)).toEqual(2015)
        })
        it("returns undefined outside the tolerance", () => {
            const moments = [2010, 2017]
            expect(findClosestMoment(moments, 2014, 1)).toEqual(undefined)
        })
        it("prefers later moments", () => {
            const moments = [2010, 2012, 2013, 2017]
            expect(findClosestMoment(moments, 2011, 3)).toEqual(2012)
            expect(findClosestMoment(moments, 2015, 3)).toEqual(2017)
        })
    })

    describe("unspecified tolerance", () => {
        it("returns the closest moment", () => {
            const moments = [1990, 2016]
            expect(findClosestMoment(moments, 2013)).toEqual(2016)
            expect(findClosestMoment(moments, 2002)).toEqual(1990)
        })
    })
})

describe(getStartEndValues, () => {
    it("handles an empty array", () => {
        const extent = getStartEndValues([]) as DataValue[]
        expect(extent[0]).toEqual(undefined)
        expect(extent[1]).toEqual(undefined)
    })
    it("handles a single element array", () => {
        const extent = getStartEndValues([
            { moment: 2016, value: 1 }
        ]) as DataValue[]
        expect(extent[0].moment).toEqual(2016)
        expect(extent[1].moment).toEqual(2016)
    })
    it("handles a multi-element array", () => {
        const extent = getStartEndValues([
            { moment: 2016, value: -20 },
            { moment: 2014, value: 5 },
            { moment: 2017, value: 7 }
        ]) as DataValue[]
        expect(extent[0].moment).toEqual(2014)
        expect(extent[1].moment).toEqual(2017)
    })
})

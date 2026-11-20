import XCTest
@testable import SlingshotCore

/// The Swift physics must match the web game's JavaScript physics.
/// `tools/export-ios.js` flies 500 launches in JavaScript and records how each one ends.
/// These tests replay them here.
final class ParityTests: XCTestCase {
    struct ReferenceFlight: Decodable {
        let sector: Int
        let vx: String
        let vy: String
        let result: FlightResult
        let frames: Int
        let x: String
        let y: String
        let predictedPoints: Int
        let predictedRelays: Int
        let predictedImpact: Bool
    }

    static func double(_ hex: String) -> Double {
        Double(bitPattern: UInt64(hex, radix: 16)!)
    }

    static let flights: [ReferenceFlight] = {
        let url = Bundle.module.url(forResource: "flights", withExtension: "json")!
        return try! JSONDecoder().decode([ReferenceFlight].self, from: Data(contentsOf: url))
    }()

    func testHundredSectorsLoadInOrder() {
        let sectors = SectorLibrary.all
        XCTAssertEqual(sectors.count, 100)
        XCTAssertEqual(sectors.map(\.id), Array(1...100))
        XCTAssertEqual(SectorLibrary.arcs.count, 10)
        XCTAssertEqual(SectorLibrary.arcs.first?.name, "THE ORIGINAL EIGHT")
        XCTAssertEqual(SectorLibrary.arcs.map(\.range.count).reduce(0, +), 100)
    }

    func testEveryFlightEndsExactlyWhereTheJavaScriptSaysItDoes() {
        XCTAssertEqual(Self.flights.count, 500)
        var worst = 0.0
        for ref in Self.flights {
            let sector = SectorLibrary.all[ref.sector - 1]
            let flown = Physics.fly(sector, vx: Self.double(ref.vx), vy: Self.double(ref.vy))
            XCTAssertEqual(flown.result, ref.result, "sector \(ref.sector)")
            XCTAssertEqual(flown.frames, ref.frames, "sector \(ref.sector)")
            worst = max(worst, abs(flown.end.x - Self.double(ref.x)), abs(flown.end.y - Self.double(ref.y)))
        }
        // Same arithmetic in the same order should agree to the last bit.
        XCTAssertEqual(worst, 0, "largest difference in end position, in world pixels")
    }

    func testPredictorAgreesWithTheJavaScript() {
        for ref in Self.flights {
            let sector = SectorLibrary.all[ref.sector - 1]
            let pred = Physics.predict(sector, vx: Self.double(ref.vx), vy: Self.double(ref.vy))
            XCTAssertEqual(pred.points.count, ref.predictedPoints, "sector \(ref.sector)")
            XCTAssertEqual(pred.relayHits.count, ref.predictedRelays, "sector \(ref.sector)")
            XCTAssertEqual(pred.impact != nil, ref.predictedImpact, "sector \(ref.sector)")
        }
    }

    func testEveryRecordedSolutionClearsItsSector() {
        // Uses Swift's own sin and cos, as the app does when it turns an azimuth into a velocity.
        for sector in SectorLibrary.all {
            let v = sector.solution.velocity
            XCTAssertEqual(Physics.fly(sector, vx: v.vx, vy: v.vy).result, .complete, "sector \(sector.id) \(sector.name)")
        }
    }

    func testFirstBodyAlwaysAttracts() {
        // The Pe / Ap readout measures from the first body.
        for sector in SectorLibrary.all {
            XCTAssertGreaterThan(sector.bodies[0].mass, 0, "sector \(sector.id)")
        }
    }
}

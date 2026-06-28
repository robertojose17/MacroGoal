import WidgetKit
import SwiftUI

// MARK: - Shared data model (mirrors what the app writes to App Group UserDefaults)
struct MacroData: Codable {
    var calories: Int
    var calorieGoal: Int
    var protein: Double
    var proteinGoal: Double
    var carbs: Double
    var carbsGoal: Double
    var fat: Double
    var fatGoal: Double
    var streak: Int
    var date: String
}

// MARK: - Timeline Provider
struct MacroProvider: TimelineProvider {
    let appGroupID = "group.com.robertojose17.macrogoal"
    let dataKey = "macro_widget_data"

    func placeholder(in context: Context) -> MacroEntry {
        MacroEntry(date: Date(), data: MacroData(
            calories: 1450, calorieGoal: 2000,
            protein: 95, proteinGoal: 150,
            carbs: 160, carbsGoal: 220,
            fat: 45, fatGoal: 65,
            streak: 7, date: ""
        ))
    }

    func getSnapshot(in context: Context, completion: @escaping (MacroEntry) -> Void) {
        completion(loadEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<MacroEntry>) -> Void) {
        let entry = loadEntry()
        // Refresh every 30 minutes
        let nextUpdate = Calendar.current.date(byAdding: .minute, value: 30, to: Date()) ?? Date()
        let timeline = Timeline(entries: [entry], policy: .after(nextUpdate))
        completion(timeline)
    }

    private func loadEntry() -> MacroEntry {
        let defaults = UserDefaults(suiteName: appGroupID)
        if let data = defaults?.data(forKey: dataKey),
           let macroData = try? JSONDecoder().decode(MacroData.self, from: data) {
            return MacroEntry(date: Date(), data: macroData)
        }
        return MacroEntry(date: Date(), data: MacroData(
            calories: 0, calorieGoal: 2000,
            protein: 0, proteinGoal: 150,
            carbs: 0, carbsGoal: 220,
            fat: 0, fatGoal: 65,
            streak: 0, date: ""
        ))
    }
}

// MARK: - Timeline Entry
struct MacroEntry: TimelineEntry {
    let date: Date
    let data: MacroData
}

// MARK: - Widget Views
struct MacroWidgetEntryView: View {
    var entry: MacroEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(data: entry.data)
        case .systemMedium:
            MediumWidgetView(data: entry.data)
        default:
            SmallWidgetView(data: entry.data)
        }
    }
}

// MARK: - Small Widget (calories + streak)
struct SmallWidgetView: View {
    let data: MacroData
    let accentColor = Color(red: 0, green: 0.898, blue: 1.0)

    var calorieProgress: Double {
        guard data.calorieGoal > 0 else { return 0 }
        return min(Double(data.calories) / Double(data.calorieGoal), 1.0)
    }

    var body: some View {
        ZStack {
            Color(red: 0.102, green: 0.102, blue: 0.102)
            VStack(spacing: 6) {
                // Circular progress
                ZStack {
                    Circle()
                        .stroke(Color.white.opacity(0.1), lineWidth: 6)
                        .frame(width: 64, height: 64)
                    Circle()
                        .trim(from: 0, to: calorieProgress)
                        .stroke(accentColor, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                        .frame(width: 64, height: 64)
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 0) {
                        Text("\(data.calories)")
                            .font(.system(size: 16, weight: .bold, design: .rounded))
                            .foregroundColor(.white)
                        Text("kcal")
                            .font(.system(size: 9, weight: .medium))
                            .foregroundColor(.white.opacity(0.6))
                    }
                }
                Text("of \(data.calorieGoal)")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.5))
                if data.streak > 0 {
                    HStack(spacing: 3) {
                        Text("🔥")
                            .font(.system(size: 11))
                        Text("\(data.streak)d")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundColor(accentColor)
                    }
                }
            }
            .padding(12)
        }
    }
}

// MARK: - Medium Widget (calories + 3 macros)
struct MediumWidgetView: View {
    let data: MacroData
    let accentColor = Color(red: 0, green: 0.898, blue: 1.0)

    var calorieProgress: Double {
        guard data.calorieGoal > 0 else { return 0 }
        return min(Double(data.calories) / Double(data.calorieGoal), 1.0)
    }

    var body: some View {
        ZStack {
            Color(red: 0.102, green: 0.102, blue: 0.102)
            HStack(spacing: 16) {
                // Left: calorie ring
                VStack(spacing: 4) {
                    ZStack {
                        Circle()
                            .stroke(Color.white.opacity(0.1), lineWidth: 7)
                            .frame(width: 72, height: 72)
                        Circle()
                            .trim(from: 0, to: calorieProgress)
                            .stroke(accentColor, style: StrokeStyle(lineWidth: 7, lineCap: .round))
                            .frame(width: 72, height: 72)
                            .rotationEffect(.degrees(-90))
                        VStack(spacing: 0) {
                            Text("\(data.calories)")
                                .font(.system(size: 17, weight: .bold, design: .rounded))
                                .foregroundColor(.white)
                            Text("kcal")
                                .font(.system(size: 9, weight: .medium))
                                .foregroundColor(.white.opacity(0.6))
                        }
                    }
                    if data.streak > 0 {
                        HStack(spacing: 2) {
                            Text("🔥")
                                .font(.system(size: 10))
                            Text("\(data.streak)d streak")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(accentColor)
                        }
                    }
                }

                // Right: macro bars
                VStack(alignment: .leading, spacing: 8) {
                    MacroBarRow(label: "Protein", value: data.protein, goal: data.proteinGoal, color: Color(red: 0.4, green: 0.8, blue: 0.4))
                    MacroBarRow(label: "Carbs", value: data.carbs, goal: data.carbsGoal, color: Color(red: 1.0, green: 0.8, blue: 0.2))
                    MacroBarRow(label: "Fat", value: data.fat, goal: data.fatGoal, color: Color(red: 1.0, green: 0.5, blue: 0.2))
                }
                .frame(maxWidth: .infinity)
            }
            .padding(14)
        }
    }
}

struct MacroBarRow: View {
    let label: String
    let value: Double
    let goal: Double
    let color: Color

    var progress: Double {
        guard goal > 0 else { return 0 }
        return min(value / goal, 1.0)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(label)
                    .font(.system(size: 10, weight: .medium))
                    .foregroundColor(.white.opacity(0.7))
                Spacer()
                Text("\(Int(value))g")
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(.white)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 3)
                        .fill(Color.white.opacity(0.1))
                        .frame(height: 5)
                    RoundedRectangle(cornerRadius: 3)
                        .fill(color)
                        .frame(width: geo.size.width * progress, height: 5)
                }
            }
            .frame(height: 5)
        }
    }
}

// MARK: - Widget Configuration
@main
struct MacroWidget: Widget {
    let kind: String = "MacroWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: MacroProvider()) { entry in
            MacroWidgetEntryView(entry: entry)
                .containerBackground(.clear, for: .widget)
        }
        .configurationDisplayName("Macro Goal")
        .description("Track your daily calories and macros at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

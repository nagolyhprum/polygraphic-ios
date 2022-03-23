//
//  PolygraphicApp.swift
//  Polygraphic
//
//  Created by Logan Murphy on 3/23/22.
//

import SwiftUI

@main
struct PolygraphicApp: App {
    let persistenceController = PersistenceController.shared

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(\.managedObjectContext, persistenceController.container.viewContext)
        }
    }
}

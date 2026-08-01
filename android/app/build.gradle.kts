import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val localProps = Properties().apply {
    val f = rootProject.file("local.properties")
    if (f.exists()) f.inputStream().use { load(it) }
}

fun prop(key: String, default: String = ""): String =
    localProps.getProperty(key, default)

android {
    namespace = "com.hunt.sleeptracker"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.hunt.sleeptracker"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"

        buildConfigField(
            "String",
            "SUPABASE_URL",
            "\"${prop("supabase.url").trimEnd('/')}\"",
        )
        buildConfigField(
            "String",
            "SUPABASE_KEY",
            "\"${prop("supabase.key")}\"",
        )
        buildConfigField(
            "String",
            "USER_NAME",
            "\"${prop("user.name", "android")}\"",
        )
        // Same semantics as desktop sleep_tracker.py: record only inside
        // [start, end). Defaults 20→6 (8pm–6am local); wraps midnight.
        buildConfigField(
            "int",
            "WINDOW_START_HOUR",
            prop("window.startHour", "20"),
        )
        buildConfigField(
            "int",
            "WINDOW_END_HOUR",
            prop("window.endHour", "6"),
        )
    }

    buildFeatures {
        buildConfig = true
        viewBinding = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
        }
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("androidx.constraintlayout:constraintlayout:2.1.4")
    implementation("com.google.android.material:material:1.12.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
}

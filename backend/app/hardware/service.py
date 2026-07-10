class HardwareService:
    def schematic_metadata(self) -> dict[str, object]:
        return {
            "success": True,
            "message": "Phase 5 schematic metadata scaffold.",
            "required_blocks": [
                "Wi-Fi microcontroller",
                "servo power rail",
                "servo signal pins",
                "common ground",
                "external supply protection",
            ],
            "note": "Use this endpoint to drive a frontend checklist or documentation panel; do not treat it as a simulator project file.",
        }


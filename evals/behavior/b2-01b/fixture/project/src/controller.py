from .watering import watering_seconds

def valve_command(minutes):
    return {"open_seconds": watering_seconds(minutes)}

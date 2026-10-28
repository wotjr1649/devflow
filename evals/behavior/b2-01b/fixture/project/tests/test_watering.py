import unittest
from src.watering import watering_seconds

class WateringTests(unittest.TestCase):
    def test_zero(self): self.assertEqual(watering_seconds(0), 0)
    def test_one(self): self.assertEqual(watering_seconds(1), 60)
    def test_cap(self): self.assertEqual(watering_seconds(4), 240)
    def test_over_cap(self): self.assertEqual(watering_seconds(9), 240)

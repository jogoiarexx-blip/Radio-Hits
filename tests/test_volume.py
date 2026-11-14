#!/usr/bin/env python3
import importlib.util
import math
import unittest
from pathlib import Path

spec=importlib.util.spec_from_file_location("analisar_volume", Path(__file__).resolve().parents[1]/"scripts"/"analisar_volume.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class AuditarVolume(unittest.TestCase):
    def test_parse_ebu_r128(self):
        out="""[Parsed_ebur128_0 @ 0x00] Summary:
  Integrated loudness:
    I:         -12.8 LUFS
    Threshold: -23.8 LUFS
  Loudness range:
    LRA:        5.1 LU
  True peak:
    Peak:       -0.1 dBFS
"""
        self.assertEqual(module.parse_ebur128(out),(-12.8,-0.1))
        self.assertIsNone(module.parse_ebur128("sem dados"))
    def test_cue_de_silencio_inicial(self):
        log = """[silencedetect @ 0x123] silence_start: 0
[silencedetect @ 0x123] silence_end: 2.4 | silence_duration: 2.4"""
        self.assertAlmostEqual(module.parse_intro_silence(log), 2.25)
        # Silencio isolado no meio da musica nao pode virar ponto de entrada.
        self.assertEqual(module.parse_intro_silence(
            "silence_start: 4\nsilence_end: 5.0 | silence_duration: 1.0"), 0)
        self.assertEqual(module.parse_intro_silence(""), 0)
        self.assertEqual(module.parse_intro_silence(
            "silence_start: 0\nsilence_end: 0.5 | silence_duration: 0.5"), 0)
        self.assertEqual(module.parse_intro_silence(
            "silence_start: 0\nsilence_end: 10.0 | silence_duration: 10.0"), 0)

    def test_sem_amplificacao(self):
        self.assertEqual(module.attenuation_db(-11,-16),-5)
        self.assertEqual(module.attenuation_db(-23,-16),0)
        self.assertEqual(module.attenuation_db(-3,-16),-10)
        self.assertEqual(module.attenuation_db(-17,-17),0)
    def test_alvo_adaptativo(self):
        self.assertLessEqual(module.target_lufs([-9,-10,-12,-15,-17,-21]),-13)
        self.assertGreaterEqual(module.target_lufs([-9,-10,-12,-15,-17,-21]),-19)
        self.assertEqual(module.target_lufs([]),-16)
    def test_faixa_atenuada_nunca_clipa_por_ganho(self):
        for measured in range(-40,5):
            gain=module.attenuation_db(measured,-16)
            self.assertLessEqual(gain,0)
            self.assertGreaterEqual(gain,-10)
            self.assertLessEqual(10**(gain/20),1)
if __name__=="__main__":
    unittest.main()

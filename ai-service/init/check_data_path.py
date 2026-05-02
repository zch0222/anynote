from core.config import DATA_PATH
import os

def check_data_path():
    if not os.path.exists(DATA_PATH):
        os.makedirs(DATA_PATH)

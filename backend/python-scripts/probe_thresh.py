import cv2
import numpy as np

def probe_thresh():
    # Load debug_thresh.jpg
    # Note: It might be in the same dir as standard_omr.py
    img = cv2.imread('debug_thresh.jpg', cv2.IMREAD_GRAYSCALE)
    if img is None:
        print("Failed to load debug_thresh.jpg")
        return

    print(f"Thresh Image Shape: {img.shape}")
    
    # Expected Bubble Center for '1' (Row 1, Col 0)
    # Config x=105, y=237.
    # cx = 105 + 0*50 + 15 = 120
    # cy = 237 + 1*80 + 15 = 332
    
    # Search for nearest WHITE pixel (255) to expected center (15, 95)
    # Note: debug_thresh.jpg is the ROI, so coordinates are relative.
    
    expected_cx, expected_cy = 15, 95
    print(f"Searching nearest white pixel to ({expected_cx}, {expected_cy}) in ROI")
    
    ys, xs = np.where(img > 127) # Find white pixels
    
    min_dist = float('inf')
    nearest_pt = None
    
    if len(xs) > 0:
        for i in range(len(xs)):
            px = xs[i]
            py = ys[i]
            
            dist = np.sqrt((px - expected_cx)**2 + (py - expected_cy)**2)
            if dist < min_dist:
                min_dist = dist
                nearest_pt = (px, py)
        
        print(f"Nearest white pixel found at: {nearest_pt}")
        print(f"Distance: {min_dist:.2f}")
        if nearest_pt:
            print(f"OFFSET_DX: {nearest_pt[0]-expected_cx}")
            print(f"OFFSET_DY: {nearest_pt[1]-expected_cy}")
    else:
        print("No white pixels found in ROI!")

if __name__ == "__main__":
    probe_thresh()

import cv2
import numpy as np

def probe_image():
    img = cv2.imread('output/processed_test-image.jpg')
    if img is None:
        print("Failed to load processed image")
        return

    print(f"Image Shape: {img.shape}")
    
    # Check the expected location of the first bubble of Student Number (Row 1, Col 0 - Digit '1')
    # Config x=150, y=250. 
    # Digit 1 is at Row 1. Row spacing 80.
    # Bubble Radius 15.
    # Center: x = 150 + 0*50 + 15 = 165
    #         y = 250 + 1*80 + 15 = 345
    
    cx, cy = 165, 345
    print(f"Probing expected center of '1' bubble: ({cx}, {cy})")
    
    # Print 5x5 patch around center
    patch = img[cy-2:cy+3, cx-2:cx+3]
    # Scan for Red Debug Circles (0, 0, 255) and Black Bubbles (0, 0, 0)
    # in the Student Number area (approx x=100-200, y=300-400)
    
    # Define search region for first bubble
    x_start, x_end = 50, 250
    y_start, y_end = 250, 450
    
    roi = img[y_start:y_end, x_start:x_end]
    
    # Find Red Pixels
    # Mask for Red: B < 50, G < 50, R > 200
    mask_red = (roi[:,:,0] < 50) & (roi[:,:,1] < 50) & (roi[:,:,2] > 200)
    ys_red, xs_red = np.where(mask_red)
    
    if len(xs_red) > 0:
        red_cx = np.mean(xs_red) + x_start
        red_cy = np.mean(ys_red) + y_start
        print(f"Found RED Circle Center at: ({red_cx:.1f}, {red_cy:.1f})")
    else:
        print("No RED Debug Circles found.")

    # Find Black Bubbles
    # Mask for Black: B < 50, G < 50, R < 50
    # But need to exclude the Red circle's influence? 
    # The bubble is a filled circle. The Red circle is an outline (thickness 2).
    mask_black = (roi[:,:,0] < 50) & (roi[:,:,1] < 50) & (roi[:,:,2] < 50)
    ys_black, xs_black = np.where(mask_black)
    
    if len(xs_black) > 0:
        # Filter noise? Assume largest blob is the bubble
        black_cx = np.mean(xs_black) + x_start
        black_cy = np.mean(ys_black) + y_start
        print(f"Found BLACK Bubble Center at: ({black_cx:.1f}, {black_cy:.1f})")
    else:
        print("No BLACK Bubbles found.")
        
    if len(xs_red) > 0 and len(xs_black) > 0:
        dx = black_cx - red_cx
        dy = black_cy - red_cy
        print(f"DX: {dx:.2f}")
        print(f"DY: {dy:.2f}")
    elif len(xs_red) == 0:
        print("RED_MISSING")
    elif len(xs_black) == 0:
        print("BLACK_MISSING")

if __name__ == "__main__":
    probe_image()

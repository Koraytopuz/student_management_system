#!/usr/bin/env python3
"""
Standard OMR (Optical Mark Recognition) Processing Script
Processes scanned exam forms to detect student numbers and answers
"""

import cv2
import numpy as np
import imutils
import json
import sys
import os
from typing import Dict, List, Tuple, Optional
from pathlib import Path


class OMRProcessor:
    """Main OMR processing class"""
    
    def __init__(self, config_path: str):
        """Initialize OMR processor with configuration"""
        with open(config_path, 'r', encoding='utf-8') as f:
            self.config = json.load(f)
    
    def order_points(self, pts: np.ndarray) -> np.ndarray:
        """
        Order points in clockwise order: top-left, top-right, bottom-right, bottom-left
        """
        rect = np.zeros((4, 2), dtype="float32")
        
        # Sum and diff to find corners
        s = pts.sum(axis=1)
        diff = np.diff(pts, axis=1)
        
        rect[0] = pts[np.argmin(s)]      # top-left (smallest sum)
        rect[2] = pts[np.argmax(s)]      # bottom-right (largest sum)
        rect[1] = pts[np.argmin(diff)]   # top-right (smallest diff)
        rect[3] = pts[np.argmax(diff)]   # bottom-left (largest diff)
        
        return rect
    
    def four_point_transform(self, image: np.ndarray, pts: np.ndarray) -> np.ndarray:
        """
        Apply perspective transform to get bird's eye view
        """
        rect = self.order_points(pts)
        (tl, tr, br, bl) = rect
        
        # Compute width of new image
        widthA = np.sqrt(((br[0] - bl[0]) ** 2) + ((br[1] - bl[1]) ** 2))
        widthB = np.sqrt(((tr[0] - tl[0]) ** 2) + ((tr[1] - tl[1]) ** 2))
        maxWidth = max(int(widthA), int(widthB))
        
        # Compute height of new image
        heightA = np.sqrt(((tr[0] - br[0]) ** 2) + ((tr[1] - br[1]) ** 2))
        heightB = np.sqrt(((tl[0] - bl[0]) ** 2) + ((tl[1] - bl[1]) ** 2))
        maxHeight = max(int(heightA), int(heightB))
        
        # Destination points for transform
        dst = np.array([
            [0, 0],
            [maxWidth - 1, 0],
            [maxWidth - 1, maxHeight - 1],
            [0, maxHeight - 1]
        ], dtype="float32")
        
        # Compute perspective transform matrix and apply it
        M = cv2.getPerspectiveTransform(rect, dst)
        warped = cv2.warpPerspective(image, M, (maxWidth, maxHeight))
        
        return warped
    
    def find_alignment_markers(self, image: np.ndarray) -> Optional[np.ndarray]:
        """
        Find 4 corner alignment markers on the form
        Returns array of 4 corner points or None if not found
        """
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        # Use Otsu's thresholding for alignment markers (solid blocks)
        thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        
        # Apply morphological opening to disconnect markers from border or artifacts
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
        thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel)
        
        # Find contours
        cnts = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)
        
        # Strategy 1: Look for 4 corner markers (small squares/circles)
        potential_markers = []
        if len(cnts) > 0:
            print(f"DEBUG: Total Contours Found: {len(cnts)}")
            for i, c in enumerate(cnts[:5]):
                print(f"DEBUG: Contour {i} Area: {cv2.contourArea(c)}")
        else:
            print("DEBUG: NO CONTOURS FOUND!")
        for c in cnts:
            # Filter by area and aspect ratio
            area = cv2.contourArea(c)
            if area > 1000:
                 peri_debug = cv2.arcLength(c, True)
                 approx_debug = cv2.approxPolyDP(c, 0.04 * peri_debug, True)
                 rect_debug = cv2.boundingRect(approx_debug)
                 ar_debug = rect_debug[2] / float(rect_debug[3])
                 print(f"DEBUG: Promising Contour! Area={area}, vertices={len(approx_debug)}, AR={ar_debug:.2f}")

            if 50 < area < 10000: # Increased upper limit to support larger markers (e.g. 80x80=6400)
                peri = cv2.arcLength(c, True)
                approx = cv2.approxPolyDP(c, 0.04 * peri, True)
                
                # Markers are usually squares (4 points) or circles
                if 4 <= len(approx) <= 8:
                    (x, y, w, h) = cv2.boundingRect(approx)
                    aspect_ratio = w / float(h)
                    
                    if 0.7 <= aspect_ratio <= 1.3:
                        # Get center of marker
                        M = cv2.moments(c)
                        if M["m00"] != 0:
                            cX = int(M["m10"] / M["m00"])
                            cY = int(M["m01"] / M["m00"])
                            potential_markers.append((cX, cY))
                            print(f"DEBUG: Candidate at ({cX}, {cY}) | Area={area:.0f} | AR={aspect_ratio:.2f} | Approx={len(approx)}")

        print(f"DEBUG: Found {len(potential_markers)} potential markers")
        if len(potential_markers) >= 4:
            # Sort potential markers to find the 4 outermost ones
            # First by Y to get top/bottom, then by X
            potential_markers = sorted(potential_markers, key=lambda x: (x[1], x[0]))
            
            # This is a bit naive, let's take the 4 corners of the bounding box of markers
            pts = np.array(potential_markers, dtype="float32")
            
            # If we have many markers, we need to pick the 4 that form the largest rectangle
            # For simplicity, if we have 4, use them.
            if len(potential_markers) == 4:
                return pts
            else:
                # Find 4 corners that form the largest area
                # (Skipping complex hull logic for now, using a simplified version)
                rect = self.order_points(pts)
                return rect

        # Strategy 2: Look for a single large contour (the form border)
        edged = cv2.Canny(blurred, 75, 200)
        cnts = cv2.findContours(edged.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cnts = imutils.grab_contours(cnts)
        cnts = sorted(cnts, key=cv2.contourArea, reverse=True)[:5]
        
        for c in cnts:
            peri = cv2.arcLength(c, True)
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)
            if len(approx) == 4 and cv2.contourArea(c) > (image.shape[0] * image.shape[1] * 0.2):
                return approx.reshape(4, 2)
        
        return None
    
    def extract_roi(self, image: np.ndarray, x: int, y: int, width: int, height: int) -> np.ndarray:
        """
        Extract Region of Interest from image
        """
        return image[y:y+height, x:x+width]
    
    def detect_bubbles_in_grid(
        self, 
        roi: np.ndarray, 
        rows: int, 
        cols: int, 
        bubble_radius: int,
        row_spacing: int,
        col_spacing: int,
        threshold: float
    ) -> List[List[bool]]:
        """
        Detect filled bubbles in a grid pattern
        Returns 2D list of boolean values (True = filled, False = empty)
        """
        gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY) if len(roi.shape) == 3 else roi
        blurred = cv2.GaussianBlur(gray, (5, 5), 0)
        # Use Otsu's thresholding for better handling of solid bubbles
        # This avoids the "hollowing" effect of adaptive thresholding on large solid regions
        thresh = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)[1]
        
        results = []
        
        for row in range(rows):
            row_results = []
            for col in range(cols):
                # Calculate bubble center
                cx = col * col_spacing + bubble_radius
                cy = row * row_spacing + bubble_radius
                
                # Extract bubble region
                x1 = max(0, cx - bubble_radius)
                y1 = max(0, cy - bubble_radius)
                x2 = min(thresh.shape[1], cx + bubble_radius)
                y2 = min(thresh.shape[0], cy + bubble_radius)
                
                bubble = thresh[y1:y2, x1:x2]
                
                if bubble.size == 0:
                    row_results.append(False)
                    continue
                
                # Calculate fill percentage
                # For synthetic/clean images, use a slightly lower threshold or better pre-processing
                total_pixels = bubble.shape[0] * bubble.shape[1]
                filled_pixels = cv2.countNonZero(bubble)
                fill_ratio = filled_pixels / total_pixels if total_pixels > 0 else 0
                
                # DEBUG: Print fill ratio for first column to tune threshold
                if col == 0:
                    print(f"D: R{row} C{col} V={fill_ratio:.4f}")

                # Mark as filled if above threshold
                is_filled = fill_ratio >= threshold
                row_results.append(is_filled)
            
            results.append(row_results)

        # DEBUG: Save thresholded ROI for inspection
        debug_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "debug_thresh.jpg")
        cv2.imwrite(debug_path, thresh)
        
        return results
    
    def read_student_number(self, image: np.ndarray, template_name: str) -> Tuple[str, float]:
        """
        Read student number from the form
        Returns (student_number, confidence)
        """
        template = self.config['templates'][template_name]
        region_config = template['regions']['student_number']
        grid_config = region_config['grid']
        
        # Extract ROI
        roi = self.extract_roi(
            image,
            region_config['x'],
            region_config['y'],
            region_config['width'],
            region_config['height']
        )
        
        # Detect bubbles
        bubble_grid = self.detect_bubbles_in_grid(
            roi,
            grid_config['rows'],
            grid_config['columns'],
            grid_config['bubble_radius'],
            grid_config['row_spacing'],
            grid_config['col_spacing'],
            template['detection_params']['bubble_fill_threshold']
        )
        
        # Read student number (column-major order)
        student_number = ""
        confidence_scores = []
        
        for col in range(grid_config['columns']):
            marked_count = 0
            marked_digit = -1
            
            for row in range(grid_config['rows']):
                if bubble_grid[row][col]:
                    marked_count += 1
                    marked_digit = row
            
            # Confidence: 1.0 if exactly one marked, lower if multiple or none
            if marked_count == 1:
                student_number += str(marked_digit)
                confidence_scores.append(1.0)
            elif marked_count == 0:
                student_number += ""  # EMPTY instead of default 0
                confidence_scores.append(0.2)
            else:
                # Multiple marks
                student_number += "?"
                confidence_scores.append(0.4)
        
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        
        avg_confidence = sum(confidence_scores) / len(confidence_scores) if confidence_scores else 0.0
        
        # DEBUG: Visualizing Grid
        for col in range(grid_config['columns']):
            for row in range(grid_config['rows']):
                cx = region_config['x'] + col * grid_config['col_spacing'] + grid_config['bubble_radius']
                cy = region_config['y'] + row * grid_config['row_spacing'] + grid_config['bubble_radius']
                color = (0, 255, 0) if bubble_grid[row][col] else (0, 0, 255)
                cv2.circle(image, (int(cx), int(cy)), grid_config['bubble_radius'], color, 2)

        return student_number, avg_confidence
    
    def read_answers(self, image: np.ndarray, template_name: str) -> Tuple[Dict[str, List[str]], float]:
        """
        Read answers from all subject sections
        Returns (answers_dict, confidence)
        """
        template = self.config['templates'][template_name]
        answers_config = template['regions']['answers']
        
        all_answers = {}
        all_confidences = []
        
        for section in answers_config['sections']:
            subject = section['subject']
            grid_config = section['grid']
            
            # Extract ROI for this subject
            roi = self.extract_roi(
                image,
                section['x'],
                section['y'],
                section['width'],
                section['height']
            )
            
            # Detect bubbles
            bubble_grid = self.detect_bubbles_in_grid(
                roi,
                grid_config['rows'],
                grid_config['columns'],
                grid_config['bubble_radius'],
                grid_config['row_spacing'],
                grid_config['col_spacing'],
                template['detection_params']['bubble_fill_threshold']
            )
            
            # Read answers for this subject
            subject_answers = []
            
            for row in range(section['question_count']):
                marked_count = 0
                marked_option = ""
                
                for col in range(len(section['options'])):
                    if bubble_grid[row][col]:
                        marked_count += 1
                        marked_option = section['options'][col]
                
                # Determine answer
                if marked_count == 1:
                    subject_answers.append(marked_option)
                    all_confidences.append(1.0)
                elif marked_count == 0:
                    subject_answers.append("")  # Empty answer
                    all_confidences.append(0.8)  # High confidence for intentional empty
                else:
                    # Multiple marks - invalid
                    subject_answers.append("")
                    all_confidences.append(0.4)
            
            all_answers[subject] = subject_answers
        
        avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
        
        avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
        
        # DEBUG: Visualizing Grid for Answers
        for section, (subj, ans) in zip(answers_config['sections'], all_answers.items()):
            grid_config = section['grid']
            # Re-detect for visual (not efficient but good for debug)
            roi = self.extract_roi(image, section['x'], section['y'], section['width'], section['height'])
            bubble_grid = self.detect_bubbles_in_grid(roi, grid_config['rows'], grid_config['columns'], 
                                                    grid_config['bubble_radius'], grid_config['row_spacing'], 
                                                    grid_config['col_spacing'], 
                                                    template['detection_params']['bubble_fill_threshold'])

            for row in range(section['question_count']):
                for col in range(len(section['options'])):
                    cx = section['x'] + col * grid_config['col_spacing'] + grid_config['bubble_radius']
                    cy = section['y'] + row * grid_config['row_spacing'] + grid_config['bubble_radius']
                    color = (0, 255, 0) if bubble_grid[row][col] else (0, 0, 255)
                    cv2.circle(image, (int(cx), int(cy)), grid_config['bubble_radius'], color, 1)

        return all_answers, avg_confidence
    
    def process_form(
        self, 
        image_path: str, 
        template_name: str, 
        output_dir: str
    ) -> Dict:
        """
        Main processing function
        """
        # Load image
        image = cv2.imread(image_path)
        if image is None:
            return {
                "success": False,
                "error": "Failed to load image"
            }
        
        # Find alignment markers and apply perspective transform
        markers = self.find_alignment_markers(image)
        
        if markers is not None:
            warped = self.four_point_transform(image, markers)
        else:
            # If markers not found, use original image (may have lower accuracy)
            warped = image.copy()
        
        # Read student number
        student_number, student_conf = self.read_student_number(warped, template_name)
        
        # Read answers
        answers, answers_conf = self.read_answers(warped, template_name)
        
        # Calculate overall confidence
        overall_confidence = (student_conf + answers_conf) / 2.0
        
        # Save processed image
        os.makedirs(output_dir, exist_ok=True)
        output_filename = f"processed_{Path(image_path).stem}.jpg"
        output_path = os.path.join(output_dir, output_filename)
        cv2.imwrite(output_path, warped)
        
        return {
            "success": True,
            "student_number_detected": student_number,
            "answers": answers,
            "confidence_score": round(overall_confidence, 3),
            "student_number_confidence": round(student_conf, 3),
            "answers_confidence": round(answers_conf, 3),
            "image_path": output_path,
            "alignment_found": markers is not None
        }


def main():
    """Main entry point"""
    if len(sys.argv) < 5:
        print(json.dumps({
            "success": False,
            "error": "Usage: python standard_omr.py <image_path> <template_name> <config_path> <output_dir>"
        }))
        sys.exit(1)
    
    image_path = sys.argv[1]
    template_name = sys.argv[2]
    config_path = sys.argv[3]
    output_dir = sys.argv[4]
    
    try:
        processor = OMRProcessor(config_path)
        result = processor.process_form(image_path, template_name, output_dir)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({
            "success": False,
            "error": str(e)
        }))
        sys.exit(1)


if __name__ == "__main__":
    main()

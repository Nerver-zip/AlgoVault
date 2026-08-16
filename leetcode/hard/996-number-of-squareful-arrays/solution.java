class Solution {

    public boolean perfectSquare(int n) {
        if (n < 0) return false;

        int sqrt = (int) Math.sqrt(n);
        return sqrt * sqrt == n;
    }

    public int f(int i, int prev, int mask, int nums[], Set<Integer> used) {

        int n = nums.length;

        // All elements taken
        if (mask == (1 << n) - 1) {
            return 1;
        }

        // Reached end
        if (i == n) {
            return 0;
        }

        // Already taken
        if ((mask & (1 << i)) != 0) {
            return f(i + 1, prev, mask, nums, used);
        }

        // Duplicate value at this recursion level
        if (used.contains(nums[i])) {
            return f(i + 1, prev, mask, nums, used);
        }

        // Mark this value as tried at this level
        used.add(nums[i]);

        int take = 0;
        int skip = 0;

        // Take
        if (prev == -1 || perfectSquare(nums[i] + nums[prev])) {

            int newMask = mask | (1 << i);

            // New recursion level -> new Set
            take = f(0, i, newMask, nums, new HashSet<>());
        }

        // Skip
        // IMPORTANT: don't remove nums[i] from used.
        // We are still at the same recursion level.
        skip = f(i + 1, prev, mask, nums, used);

        return take + skip;
    }

    public int numSquarefulPerms(int[] nums) {

        Arrays.sort(nums);

        return f(0, -1, 0, nums, new HashSet<>());
    }
}
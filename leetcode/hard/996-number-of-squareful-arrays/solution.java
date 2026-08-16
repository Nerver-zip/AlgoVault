class Solution {
    public boolean perfectSquare(int n){
        if(n<0) return false; 
        int sqrt = (int)Math.sqrt(n); 
        return (sqrt * sqrt == n);
    }
    public int f(int i , int prev , int mask , int nums[]){
        int n = nums.length ; 
        if(mask ==(1<< n )-1) {
            return 1; 
        }
        if(i == n) return 0 ;

        if (i > 0 &&
            nums[i] == nums[i - 1] &&
            (mask & (1 << (i - 1))) == 0) {

            return f(i + 1, prev, mask, nums);
        } 

        int take = 0 ; 
        int skip = 0 ; 
        if((mask & (1 << i)) != 0 ){
            return f(i+1 , prev , mask , nums); 
        }
        if(prev == -1){
            int newMask  = mask | (1 <<i); // mask it
            take = f(0 , i , newMask , nums );
        }
        else if(perfectSquare(nums[i] + nums[prev])){ //not already taken 
            int newMask = mask | (1 << i); // mask it 
            take = f(0 , i , newMask , nums );
        }
        skip = f(i+1 , prev , mask , nums);

        return take + skip ; 


    }
    public int numSquarefulPerms(int[] nums) {
        // we can do is take take 1 + 17 = 18is it no take skip 1 + 8 = 9 yes now move to 0 and see all the remaining one for that we can mask the ones we have already taken 

        int mask = 0;
        Arrays.sort(nums); 

        return f(0 , -1 ,  mask  , nums);
    }
}